import type {
	AiTrafficSpansInsert,
	McpSpansInsert,
} from "@databuddy/db/clickhouse/tables";
import {
	getWebsiteByIdV2,
	isOriginAllowed,
	resolveApiKeyOwnerId,
} from "@hooks/auth";
import {
	API_KEY_DENIAL_ERRORS,
	type ApiKeyRow,
	denyApiKeyWebsiteAccess,
	getApiKeyFromHeader,
	hasKeyScope,
} from "@lib/api-key";
import { checkAutumnUsage } from "@lib/billing";
import { parseCorsSafeJson } from "@lib/cors-safe-json";
import { insertCustomEvents } from "@lib/event-service";
import { runFork, send, sendBatch } from "@lib/producer";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { redis } from "@databuddy/redis/redis";
import {
	setupCheckKey,
	setupCheckNonce,
} from "@databuddy/shared/bot-detection/ai-agents";
import {
	CONTENT_FORMATS,
	contentFormat,
	isAssetPath,
} from "@databuddy/shared/bot-detection/types";
import {
	agentSpanColumns,
	checkForBot,
	getWebsiteSecuritySettings,
} from "@lib/request-validation";
import { summarizeRejectedBody } from "@lib/rejection-summary";
import {
	basketErrors,
	createIngestSchemaValidationError,
	rethrowOrWrap,
} from "@lib/structured-errors";
import { record } from "@lib/tracing";
import {
	extractAllowlistClientIp,
	extractTrustedClientIp,
	getVisitorCountryForAutoMode,
} from "@utils/ip-geo";
import { isValidIpFromSettings } from "@utils/origin-ip-validation";
import {
	sanitizeString,
	VALIDATION_LIMITS,
	validatePayloadSize,
} from "@utils/validation";
import { gunzipSync } from "node:zlib";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";
import { z } from "zod";
import { type TrackEventPayload, trackEventSchema } from "./track-event-schema";

function truncated(maxLength: number) {
	return z.string().transform((value) => value.slice(0, maxLength));
}

const agentHitSchema = z.object({
	websiteId: z.string().min(1).max(128),
	host: z.string().min(1).max(253),
	path: truncated(2048),
	format: z.enum(CONTENT_FORMATS).catch("html"),
	userAgent: truncated(512),
	accept: truncated(512).optional(),
	signatureAgent: truncated(512).optional(),
	referrer: truncated(2048).optional(),
});

const vercelLogSchema = z.object({
	id: z.string().optional(),
	requestId: z.string().optional(),
	timestamp: z.number().optional(),
	proxy: z.object({
		host: z.string().min(1).max(253),
		method: z.enum(["GET", "HEAD"]),
		path: z.string(),
		referer: truncated(2048).optional(),
		statusCode: z.number().int().optional(),
		timestamp: z.number().optional(),
		userAgent: z.array(truncated(512)).optional(),
	}),
});

const VERCEL_LOGS_MAX_BYTES = 10 * 1024 * 1024;

const uint32 = z.number().int().min(0).max(4_294_967_295);

const mcpCallsSchema = z
	.array(
		z.object({
			tool: truncated(256),
			durationMs: uint32,
			error: z.string().transform(mcpFailure).optional(),
			errorCode: truncated(64).optional(),
			outputChars: uint32.default(0),
			sessionId: truncated(128).optional(),
			clientName: truncated(128).optional(),
			clientVersion: truncated(64).optional(),
			serverName: truncated(128).optional(),
			serverVersion: truncated(64).optional(),
			userAgent: truncated(512).optional(),
			timestamp: z.number().int().optional(),
			websiteId: z.string().min(1).max(128).optional(),
			environment: truncated(32).optional(),
		})
	)
	.min(1)
	.max(100);

const MCP_CLIENT_PRODUCTS: Record<string, string> = {
	"@librechat/api-client": "LibreChat",
	"@n8n/n8n-nodes-langchain.mcpclienttool": "n8n",
	"amp-mcp-client": "Amp",
	"antigravity-client": "Google Antigravity",
	chatgpt: "ChatGPT",
	"cherry studio": "Cherry Studio",
	"claude-ai": "Claude",
	"claude-code": "Claude Code",
	cline: "Cline",
	codex: "Codex",
	"codex-mcp-client": "Codex",
	"com.raycast.macos": "Raycast",
	"continue-cli-client": "Continue",
	crush: "Crush",
	"cursor-vscode": "Cursor",
	"dust-mcp-client": "Dust",
	"factory-cli": "Factory",
	"gemini-cli-mcp-client": "Gemini CLI",
	"github-copilot-developer": "GitHub Copilot CLI",
	goose: "Goose",
	"jan-streamable-client": "Jan",
	"jetbrains-iu-copilot-intellij": "JetBrains AI Assistant",
	"jetbrains-jbc-copilot-intellij": "JetBrains AI Assistant",
	"kilo-code": "Kilo Code",
	"lobehub-mcp-client": "LobeHub",
	"make-app-mcp-client": "Make",
	mistral: "Mistral Le Chat",
	opencode: "OpenCode",
	"postman-client": "Postman",
	"q-dev-cli": "Amazon Q Developer",
	"roo-code": "Roo Code",
	"visual studio code": "VS Code",
	"visual-studio-code": "VS Code",
	windsurf: "Windsurf",
	"windsurf-client": "Windsurf",
	"xcode-copilot-xcode": "GitHub Copilot for Xcode",
	zed: "Zed",
};

const MCP_CLIENT_USER_AGENTS: [RegExp, string][] = [
	[/claude-code\//i, "Claude Code"],
	[/^(Anthropic\/ClaudeAI|Claude-User)/i, "Claude"],
	[/^openai-mcp\//i, "ChatGPT"],
];

const MCP_ERROR_PREFIX = /^MCP error (-?\d+): (.*)$/s;

const JSON_RPC_ERROR_CODES: Record<number, string> = {
	[-32_700]: "parse_error",
	[-32_600]: "invalid_request",
	[-32_601]: "method_not_found",
	[-32_602]: "invalid_params",
	[-32_603]: "internal_error",
	[-32_001]: "request_timeout",
};

const mcpErrorCodeSchema = z.union([z.string(), z.number()]).optional();

const mcpErrorBodySchema = z.union([
	z
		.object({
			error: z.object({ message: z.string(), code: mcpErrorCodeSchema }),
		})
		.transform(({ error }) => error),
	z
		.object({ error: z.string() })
		.transform(({ error }) => ({ message: error, code: undefined })),
	z.object({ message: z.string(), code: mcpErrorCodeSchema }),
]);

function mcpErrorCode(code: string | number | undefined): string | undefined {
	const name = typeof code === "number" ? JSON_RPC_ERROR_CODES[code] : code;
	return name ? name.slice(0, 64) : undefined;
}

function mcpFailure(text: string): { code?: string; message: string } {
	const rpc = MCP_ERROR_PREFIX.exec(text);
	if (rpc) {
		return {
			code: mcpErrorCode(Number(rpc[1])),
			message: (rpc[2] ?? "").slice(0, 512),
		};
	}
	if (text.startsWith("{")) {
		try {
			const { data } = mcpErrorBodySchema.safeParse(JSON.parse(text));
			if (data) {
				return {
					code: mcpErrorCode(data.code),
					message: data.message.slice(0, 512),
				};
			}
		} catch {
			return { message: text.slice(0, 512) };
		}
	}
	return { message: text.slice(0, 512) };
}

function mcpClient(clientName = "", userAgent = ""): string {
	const name = clientName.toLowerCase();
	return (
		(Object.hasOwn(MCP_CLIENT_PRODUCTS, name)
			? MCP_CLIENT_PRODUCTS[name]
			: undefined) ??
		MCP_CLIENT_USER_AGENTS.find(([pattern]) => pattern.test(userAgent))?.[1] ??
		clientName
	);
}

function parseVercelLogs(body: Uint8Array): {
	entries: unknown[];
	malformed: number;
} {
	const bytes =
		body[0] === 0x1f && body[1] === 0x8b
			? gunzipSync(body, { maxOutputLength: VERCEL_LOGS_MAX_BYTES })
			: body;
	const text = new TextDecoder().decode(bytes).trim();
	if (text.startsWith("[")) {
		const parsed: unknown = JSON.parse(text);
		return { entries: Array.isArray(parsed) ? parsed : [], malformed: 0 };
	}
	let malformed = 0;
	const entries = text.split("\n").flatMap((line) => {
		if (!line.trim()) {
			return [];
		}
		try {
			return [JSON.parse(line)];
		} catch {
			malformed += 1;
			return [];
		}
	});
	return { entries, malformed };
}

async function loadHostCheck(websiteId: string) {
	const website = await getWebsiteByIdV2(websiteId).catch(() => {
		useLogger().set({ website_lookup: "unavailable" });
	});
	if (website === null) {
		throw basketErrors.trackWebsiteNotFound();
	}
	if (!website) {
		return { isHostAllowed: () => true, verification: "host_unchecked" };
	}
	const { allowedOrigins } = getWebsiteSecuritySettings(website.settings) ?? {};
	return {
		isHostAllowed: (host: string) =>
			isOriginAllowed(`https://${host}`, website.domain, allowedOrigins),
		verification: "",
	};
}

async function recordedSetupCheck(
	websiteId: string,
	userAgent: string
): Promise<boolean> {
	const nonce = setupCheckNonce(userAgent);
	if (nonce) {
		await redis.set(setupCheckKey(websiteId, nonce), "1", "EX", 120);
	}
	return nonce !== null;
}

interface ResolvedAuth {
	apiKey?: ApiKeyRow;
	organizationId?: string;
	ownerId: string;
	websiteId?: string;
}

function json(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function parseTimestamp(
	value: number | string | Date | undefined,
	fallback: number
): number {
	if (value === undefined) {
		return fallback;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw basketErrors.trackInvalidBody();
		}
		return value;
	}
	if (value instanceof Date) {
		const timestamp = value.getTime();
		if (!Number.isFinite(timestamp)) {
			throw basketErrors.trackInvalidBody();
		}
		return timestamp;
	}
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) {
		throw basketErrors.trackInvalidBody();
	}
	return timestamp;
}

function recentTimestamp(value: number | undefined, now: number): number {
	return value !== undefined &&
		Number.isSafeInteger(value) &&
		value >= now - 6 * 3_600_000 &&
		value <= now + 300_000
		? value
		: now;
}

async function enforceWebsiteSecurity(
	website: NonNullable<Awaited<ReturnType<typeof getWebsiteByIdV2>>>,
	request: Request,
	websiteIdParam: string
): Promise<void> {
	const log = useLogger();

	if (website.status !== "ACTIVE") {
		log.set({
			auth: {
				ok: false,
				reason: "website_not_active",
				websiteId: websiteIdParam,
				status: website.status,
			},
		});
		throw basketErrors.trackWebsiteNotFound();
	}

	const origin = request.headers.get("origin");
	const settings = getWebsiteSecuritySettings(website.settings);
	const allowedOrigins = settings?.allowedOrigins;
	const allowedIps = settings?.allowedIps;

	if (allowedOrigins?.length && !origin) {
		log.set({
			auth: {
				ok: false,
				reason: "origin_missing",
				expectedDomain: website.domain,
				allowedOrigins,
			},
		});
		throw basketErrors.ingestOriginNotAuthorized();
	}

	if (origin && !isOriginAllowed(origin, website.domain, allowedOrigins)) {
		log.set({
			auth: {
				ok: false,
				reason: "origin_not_authorized",
				origin,
				expectedDomain: website.domain,
				allowedOrigins,
			},
		});
		throw basketErrors.ingestOriginNotAuthorized();
	}

	if (allowedIps && allowedIps.length > 0) {
		const ip = extractAllowlistClientIp(request);
		if (!(ip && (await isValidIpFromSettings(ip, allowedIps)))) {
			log.set({ auth: { ok: false, reason: "ip_not_authorized" } });
			throw basketErrors.ingestIpNotAuthorized();
		}
	}
}

function resolveAuth(
	request: Request,
	websiteIdParam?: string
): Promise<ResolvedAuth> {
	return record("resolveAuth", async () => {
		const log = useLogger();
		const apiKey = await getApiKeyFromHeader(request.headers);

		if (apiKey) {
			const ownerId = apiKey.organizationId ?? apiKey.userId;
			if (!ownerId) {
				log.set({
					auth: { ok: false, reason: "missing_owner", method: "api_key" },
				});
				throw basketErrors.trackMissingOwner();
			}

			log.set({
				auth: {
					ok: true,
					method: "api_key",
					organizationId: apiKey.organizationId ?? undefined,
				},
			});
			return {
				ownerId,
				apiKey,
				organizationId: apiKey.organizationId ?? undefined,
			};
		}

		if (!websiteIdParam) {
			log.set({ auth: { ok: false, reason: "no_credentials" } });
			throw basketErrors.trackMissingCredentials();
		}

		const website = await getWebsiteByIdV2(websiteIdParam);
		if (!website) {
			log.set({
				auth: {
					ok: false,
					reason: "website_not_found",
					websiteId: websiteIdParam,
				},
			});
			throw basketErrors.trackWebsiteNotFound();
		}

		if (!website.organizationId) {
			log.set({
				auth: {
					ok: false,
					reason: "no_organization",
					websiteId: websiteIdParam,
				},
			});
			throw basketErrors.trackWebsiteNoOrganization();
		}

		await enforceWebsiteSecurity(website, request, websiteIdParam);

		log.set({
			auth: {
				ok: true,
				method: "website_id",
				websiteId: websiteIdParam,
				organizationId: website.organizationId,
			},
		});
		return {
			ownerId: website.organizationId,
			websiteId: websiteIdParam,
			organizationId: website.organizationId,
		};
	});
}

export const trackRoute = new Elysia()
	.onParse(parseCorsSafeJson)
	.post("/track", async ({ body, query, request }) => {
		const log = useLogger();
		log.set({ route: "track" });
		const typedBody = body as unknown;
		const typedQuery = query as Record<string, string>;

		const captureRejectedBody = () => {
			const summary = summarizeRejectedBody(typedBody);
			if (summary) {
				log.set(summary);
			}
		};

		try {
			if (!validatePayloadSize(typedBody, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
				log.set({ rejected: "payload_too_large" });
				captureRejectedBody();
				throw basketErrors.trackPayloadTooLarge();
			}

			const parseResult = trackEventSchema.safeParse(typedBody);
			if (!parseResult.success) {
				log.set({ rejected: "schema" });
				captureRejectedBody();
				throw createIngestSchemaValidationError(parseResult.error.issues);
			}

			const events: TrackEventPayload[] = Array.isArray(parseResult.data)
				? parseResult.data
				: [parseResult.data];
			const websiteIdParam = typedQuery.website_id || events[0]?.websiteId;

			const auth = await resolveAuth(request, websiteIdParam);

			const userAgent =
				sanitizeString(
					request.headers.get("user-agent"),
					VALIDATION_LIMITS.STRING_MAX_LENGTH
				) || "";
			const botRejection = await checkForBot(
				request,
				typedBody,
				typedQuery,
				websiteIdParam ?? "",
				userAgent
			);
			if (botRejection) {
				log.set({ rejected: "bot" });
				return botRejection.response;
			}

			const targets = events.map((event) => ({
				event,
				websiteId: event.websiteId ?? typedQuery.website_id ?? auth.websiteId,
			}));

			log.set({
				ownerId: auth.ownerId,
				websiteId: auth.websiteId,
				count: events.length,
			});

			const rateLimitPrincipal = auth.apiKey
				? `track:apikey:${auth.apiKey.id}`
				: `track:website:${auth.websiteId ?? "unknown"}:${
						extractTrustedClientIp(request) ?? "anon"
					}`;
			const rl = await ratelimit(rateLimitPrincipal, 600, 60);
			if (!rl.success) {
				log.set({ rejected: "rate_limit" });
				captureRejectedBody();
				throw basketErrors.trackRateLimited();
			}

			if (auth.apiKey) {
				const { apiKey } = auth;
				if (
					targets.some((target) => !target.websiteId) &&
					!hasKeyScope(apiKey, "track:events")
				) {
					log.set({ rejected: "missing_scope" });
					captureRejectedBody();
					throw basketErrors.trackMissingScope();
				}
				const targetIds = [
					...new Set(
						targets.flatMap((target) =>
							target.websiteId ? [target.websiteId] : []
						)
					),
				];
				const websites = await Promise.all(
					targetIds.map((id) => getWebsiteByIdV2(id))
				);
				for (const [i, websiteId] of targetIds.entries()) {
					const denial = denyApiKeyWebsiteAccess(
						apiKey,
						websiteId,
						websites[i] ?? null
					);
					if (denial) {
						log.set({ rejected: denial, targetWebsiteId: websiteId });
						captureRejectedBody();
						throw API_KEY_DENIAL_ERRORS[denial]();
					}
				}
			} else {
				for (const { websiteId } of targets) {
					if (!websiteId) {
						captureRejectedBody();
						throw basketErrors.trackInvalidBody();
					}
					if (auth.websiteId && websiteId !== auth.websiteId) {
						log.set({ rejected: "website_scope", targetWebsiteId: websiteId });
						captureRejectedBody();
						throw basketErrors.trackWebsiteScopeMismatch();
					}
				}
			}

			const billingUserId = auth.organizationId
				? await resolveApiKeyOwnerId(auth.organizationId)
				: auth.ownerId;

			if (billingUserId) {
				await checkAutumnUsage(
					billingUserId,
					"events",
					{ api_route: "track", batch_size: events.length },
					events.length
				);
			}

			const now = Date.now();
			const spans = targets.map(({ event, websiteId }) => ({
				...(event.eventId ? { event_id: event.eventId } : {}),
				owner_id: auth.ownerId,
				website_id: websiteId,
				timestamp: parseTimestamp(event.timestamp, now),
				event_name: event.name,
				namespace: event.namespace,
				path: event.path,
				properties: event.properties,
				anonymous_id: event.anonymousId,
				anonymizeVisitorIds: event.anonymizeVisitorIds,
				profile_id: event.profileId,
				session_id: event.sessionId,
				source: event.source,
			}));

			const visitorCountry = await getVisitorCountryForAutoMode(spans, request);
			await insertCustomEvents(spans, visitorCountry);

			return json(
				{ status: "success", type: "custom_event", count: spans.length },
				200
			);
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	})
	.get(
		"/ai-traffic/setup-check/:websiteId/:nonce",
		async ({ params: { nonce, websiteId } }) => ({
			recorded: (await redis.exists(setupCheckKey(websiteId, nonce))) === 1,
		})
	)
	.post("/ai-traffic", async ({ body }) => {
		const log = useLogger();
		log.set({ route: "ai-traffic" });

		try {
			const parsed = agentHitSchema.safeParse(body);
			if (!parsed.success) {
				throw createIngestSchemaValidationError(parsed.error.issues);
			}
			const hit = parsed.data;
			log.set({ websiteId: hit.websiteId, host: hit.host });

			const hostCheck = await loadHostCheck(hit.websiteId);
			if (!hostCheck.isHostAllowed(hit.host)) {
				log.set({ rejected: "host_not_authorized" });
				throw basketErrors.ingestOriginNotAuthorized();
			}
			if (await recordedSetupCheck(hit.websiteId, hit.userAgent)) {
				return new Response(null, { status: 202 });
			}

			const columns = agentSpanColumns(hit);
			log.set({
				bot: {
					name: columns.bot_name,
					agent: columns.agent_id || null,
					signed: Boolean(hit.signatureAgent),
				},
			});
			runFork(
				send("analytics-ai-traffic-spans", {
					...columns,
					client_id: hit.websiteId,
					timestamp: Date.now(),
					user_agent: hit.userAgent,
					path: hit.path,
					format: hit.format,
					host: hit.host,
					accept: hit.accept ?? "",
					referrer: hit.referrer,
					source: "middleware",
					verification: hostCheck.verification,
				} satisfies AiTrafficSpansInsert)
			);

			return new Response(null, { status: 202 });
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	})
	.post("/mcp", async ({ body, request }) => {
		const log = useLogger();
		log.set({ route: "mcp" });

		try {
			if (!validatePayloadSize(body)) {
				log.set({ rejected: "payload_too_large" });
				throw basketErrors.trackPayloadTooLarge();
			}
			const parsed = mcpCallsSchema.safeParse(body);
			if (!parsed.success) {
				throw createIngestSchemaValidationError(parsed.error.issues);
			}
			const calls = parsed.data;
			const apiKey = await getApiKeyFromHeader(request.headers);
			if (!apiKey) {
				throw basketErrors.trackMissingCredentials();
			}
			const { organizationId } = apiKey;
			if (!organizationId) {
				throw basketErrors.trackMissingOwner();
			}
			const rl = await ratelimit(`mcp:apikey:${apiKey.id}`, 6000, 60);
			if (!rl.success) {
				log.set({ rejected: "rate_limit" });
				throw basketErrors.trackRateLimited();
			}

			if (
				calls.some((call) => !call.websiteId) &&
				!hasKeyScope(apiKey, "track:events")
			) {
				log.set({ rejected: "missing_scope" });
				throw basketErrors.trackMissingScope();
			}
			const websiteIds = [
				...new Set(calls.flatMap((call) => call.websiteId ?? [])),
			];
			const websites = await Promise.all(
				websiteIds.map((id) => getWebsiteByIdV2(id))
			);
			for (const [i, websiteId] of websiteIds.entries()) {
				const denial = denyApiKeyWebsiteAccess(
					apiKey,
					websiteId,
					websites[i] ?? null
				);
				if (denial) {
					log.set({ rejected: denial, websiteId });
					throw API_KEY_DENIAL_ERRORS[denial]();
				}
			}
			log.set({ organizationId, websiteIds, count: calls.length });

			const billingUserId = await resolveApiKeyOwnerId(organizationId);
			if (billingUserId) {
				await checkAutumnUsage(
					billingUserId,
					"events",
					{ api_route: "mcp", batch_size: calls.length },
					calls.length
				);
			}

			const now = Date.now();
			runFork(
				sendBatch(
					"analytics-mcp-spans",
					calls.map(
						(call): McpSpansInsert => ({
							owner_id: organizationId,
							website_id: call.websiteId,
							environment: call.environment,
							timestamp: recentTimestamp(call.timestamp, now),
							tool: call.tool,
							is_error: call.error !== undefined,
							error: call.error?.message,
							error_code: call.errorCode ?? call.error?.code,
							duration_ms: call.durationMs,
							output_chars: call.outputChars,
							session_id: call.sessionId,
							client: mcpClient(call.clientName, call.userAgent),
							client_name: call.clientName,
							client_version: call.clientVersion,
							server_name: call.serverName,
							server_version: call.serverVersion,
							user_agent: call.userAgent,
						})
					)
				)
			);

			return json({ status: "success", count: calls.length }, 202);
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	});

export const vercelDrainRoute = new Elysia().post(
	"/vercel/:websiteId",
	async ({ params: { websiteId }, request }) => {
		const log = useLogger();
		log.set({ route: "vercel-drain", websiteId });

		try {
			const hostCheck = await loadHostCheck(websiteId);
			const batch = await request
				.arrayBuffer()
				.then((body) => parseVercelLogs(new Uint8Array(body)))
				.catch(() => null);
			if (!batch) {
				log.set({ rejected: "unparseable_body" });
				return new Response(null, { status: 400 });
			}

			const now = Date.now();
			const seenRequests = new Set<string>();
			const spans: AiTrafficSpansInsert[] = [];
			let foreignHosts = 0;
			for (const entry of batch.entries) {
				const parsed = vercelLogSchema.safeParse(entry);
				if (!parsed.success) {
					continue;
				}
				const { id, proxy, requestId, timestamp } = parsed.data;
				const requestKey = requestId || id;
				if (
					proxy.statusCode === -1 ||
					(requestKey && seenRequests.has(requestKey))
				) {
					continue;
				}
				if (requestKey) {
					seenRequests.add(requestKey);
				}
				if (!hostCheck.isHostAllowed(proxy.host)) {
					foreignHosts += 1;
					continue;
				}
				const userAgent = proxy.userAgent?.[0] ?? "";
				const pathname = proxy.path.split("?")[0] ?? "";
				if (
					(await recordedSetupCheck(websiteId, userAgent)) ||
					isAssetPath(pathname)
				) {
					continue;
				}
				const columns = agentSpanColumns({ userAgent });
				if (!columns.agent_id) {
					continue;
				}
				spans.push({
					...columns,
					client_id: websiteId,
					timestamp: recentTimestamp(proxy.timestamp ?? timestamp, now),
					user_agent: userAgent,
					path: pathname.slice(0, 2048),
					format: contentFormat(pathname),
					host: proxy.host,
					accept: "",
					referrer: proxy.referer,
					source: "vercel",
					status_code: Math.max(proxy.statusCode ?? 0, 0),
					verification: hostCheck.verification,
				});
			}

			if (spans.length > 0) {
				runFork(sendBatch("analytics-ai-traffic-spans", spans));
			}
			log.set({
				vercel: {
					entries: batch.entries.length,
					stored: spans.length,
					malformed_lines: batch.malformed,
					foreign_hosts: foreignHosts,
				},
			});
			return new Response(null, { status: 200 });
		} catch (error) {
			rethrowOrWrap(error, log);
		}
	},
	{ parse: "none" }
);
