import type { AiTrafficSpansInsert } from "@databuddy/db/clickhouse/tables";
import {
	getWebsiteByIdV2,
	isOriginAllowed,
	resolveApiKeyOwnerId,
} from "@hooks/auth";
import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	getApiKeyFromHeader,
	hasGlobalAccess,
	hasKeyScope,
} from "@lib/api-key";
import { checkAutumnUsage } from "@lib/billing";
import { parseCorsSafeJson } from "@lib/cors-safe-json";
import { insertCustomEvents } from "@lib/event-service";
import { runFork, send, sendBatch } from "@lib/producer";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { redis } from "@databuddy/redis/redis";
import {
	agentBotCategory,
	identifyAiAgent,
	setupCheckKey,
	setupCheckNonce,
} from "@databuddy/shared/bot-detection/ai-agents";
import {
	CONTENT_FORMATS,
	contentFormatForPath,
	isAssetPath,
} from "@databuddy/shared/bot-detection/types";
import {
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
import { detectBot } from "@utils/user-agent";
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
	proxy: z
		.object({
			host: z.string().min(1).max(253),
			method: z.string().optional(),
			path: z.string(),
			referer: z.string().optional(),
			statusCode: z.number().int().optional(),
			timestamp: z.number().optional(),
			userAgent: z.array(z.string()).optional(),
		})
		.optional(),
});

const VERCEL_LOGS_MAX_BYTES = 10 * 1024 * 1024;

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
			return [JSON.parse(line) as unknown];
		} catch {
			malformed += 1;
			return [];
		}
	});
	return { entries, malformed };
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
	headers: Headers,
	request: Request,
	websiteIdParam?: string
): Promise<ResolvedAuth> {
	return record("resolveAuth", async () => {
		const log = useLogger();
		const apiKey = await getApiKeyFromHeader(headers);

		if (apiKey) {
			if (!hasKeyScope(apiKey, "track:events")) {
				log.set({
					auth: { ok: false, reason: "missing_scope", method: "api_key" },
				});
				throw basketErrors.trackMissingScope();
			}

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

			const auth = await resolveAuth(request.headers, request, websiteIdParam);

			const userAgent =
				sanitizeString(
					request.headers.get("user-agent"),
					VALIDATION_LIMITS.STRING_MAX_LENGTH
				) || "";
			const botError = await checkForBot(
				request,
				typedBody,
				typedQuery,
				auth.websiteId ?? websiteIdParam ?? "",
				userAgent
			);
			if (botError) {
				log.set({ rejected: "bot" });
				return botError.error;
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

			const allowedApiKeyWebsiteIds =
				auth.apiKey && !hasGlobalAccess(auth.apiKey)
					? new Set(getAccessibleWebsiteIds(auth.apiKey))
					: null;

			for (const target of targets) {
				const targetId = target.websiteId;

				if (auth.apiKey) {
					if (allowedApiKeyWebsiteIds && !targetId) {
						log.set({ rejected: "website_scope" });
						captureRejectedBody();
						throw basketErrors.trackWebsiteScopeMismatch();
					}
					if (
						targetId &&
						allowedApiKeyWebsiteIds &&
						!allowedApiKeyWebsiteIds.has(targetId)
					) {
						log.set({ rejected: "website_scope", targetWebsiteId: targetId });
						captureRejectedBody();
						throw basketErrors.trackWebsiteScopeMismatch();
					}
					continue;
				}

				if (!targetId) {
					captureRejectedBody();
					throw basketErrors.trackInvalidBody();
				}

				if (auth.websiteId && targetId !== auth.websiteId) {
					log.set({ rejected: "website_scope", targetWebsiteId: targetId });
					captureRejectedBody();
					throw basketErrors.trackWebsiteScopeMismatch();
				}
			}

			if (auth.apiKey) {
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
				for (const [i, website] of websites.entries()) {
					if (!website) {
						log.set({
							rejected: "website_not_found",
							targetWebsiteId: targetIds[i],
						});
						captureRejectedBody();
						throw basketErrors.trackWebsiteNotFound();
					}
					if (
						!auth.organizationId ||
						website.organizationId !== auth.organizationId
					) {
						log.set({
							rejected: "website_scope",
							targetWebsiteId: targetIds[i],
						});
						captureRejectedBody();
						throw basketErrors.trackWebsiteScopeMismatch();
					}
					if (website.status !== "ACTIVE") {
						log.set({
							rejected: "website_not_active",
							targetWebsiteId: targetIds[i],
						});
						captureRejectedBody();
						throw basketErrors.trackWebsiteNotFound();
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
		async ({ params: { nonce, websiteId } }) => {
			if (websiteId.length > 128 || nonce.length > 64) {
				return new Response(null, { status: 400 });
			}
			const recorded =
				(await redis.exists(setupCheckKey(websiteId, nonce))) === 1;
			return { recorded };
		}
	)
	.post("/ai-traffic", async ({ body, request }) => {
		const log = useLogger();
		log.set({ route: "ai-traffic" });

		try {
			const parsed = agentHitSchema.safeParse(body);
			if (!parsed.success) {
				throw createIngestSchemaValidationError(parsed.error.issues);
			}
			const hit = parsed.data;
			log.set({ websiteId: hit.websiteId, host: hit.host });

			const website = await getWebsiteByIdV2(hit.websiteId).catch(() => {
				log.set({ website_lookup: "unavailable" });
				return;
			});
			if (website === null) {
				throw basketErrors.trackWebsiteNotFound();
			}
			if (
				website &&
				!isOriginAllowed(
					`https://${hit.host}`,
					website.domain,
					getWebsiteSecuritySettings(website.settings)?.allowedOrigins
				)
			) {
				log.set({ rejected: "host_not_authorized" });
				throw basketErrors.ingestOriginNotAuthorized();
			}

			const setupNonce = setupCheckNonce(hit.userAgent);
			if (setupNonce) {
				await redis.set(
					setupCheckKey(hit.websiteId, setupNonce),
					"1",
					"EX",
					120
				);
				return new Response(null, { status: 202 });
			}

			const { botName, result } = detectBot(hit.userAgent, request);
			const agent = identifyAiAgent(hit, result?.category);
			log.set({
				bot: {
					name: botName,
					agent: agent?.id ?? null,
					purpose: agent?.purpose ?? null,
					signed: Boolean(hit.signatureAgent),
				},
			});

			const span: AiTrafficSpansInsert = {
				client_id: hit.websiteId,
				timestamp: Date.now(),
				bot_type: agent
					? agentBotCategory(agent)
					: (result?.category ?? "unknown"),
				bot_name: botName ?? agent?.operator ?? "",
				user_agent: hit.userAgent,
				path: hit.path,
				format: hit.format,
				host: hit.host,
				accept: hit.accept ?? "",
				referrer: hit.referrer,
				agent_id: agent?.id ?? "",
				agent_purpose: agent?.purpose ?? "",
				source: "middleware",
				verification: website ? "" : "host_unchecked",
			};
			runFork(send("analytics-ai-traffic-spans", span));

			return new Response(null, { status: 202 });
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
			if (websiteId.length > 128) {
				return new Response(null, { status: 400 });
			}
			const website = await getWebsiteByIdV2(websiteId).catch(() => {
				log.set({ website_lookup: "unavailable" });
				return;
			});
			if (website === null) {
				throw basketErrors.trackWebsiteNotFound();
			}

			let batch: ReturnType<typeof parseVercelLogs>;
			try {
				batch = parseVercelLogs(new Uint8Array(await request.arrayBuffer()));
			} catch {
				log.set({ rejected: "unparseable_body" });
				return new Response(null, { status: 400 });
			}
			const { entries, malformed } = batch;

			const allowedOrigins = website
				? getWebsiteSecuritySettings(website.settings)?.allowedOrigins
				: undefined;
			const seenRequests = new Set<string>();
			const spans: AiTrafficSpansInsert[] = [];
			let foreignHosts = 0;
			for (const entry of entries) {
				const parsed = vercelLogSchema.safeParse(entry);
				const proxy = parsed.success ? parsed.data.proxy : undefined;
				if (!(parsed.success && proxy) || proxy.statusCode === -1) {
					continue;
				}
				const requestKey = parsed.data.requestId ?? parsed.data.id;
				if (requestKey) {
					if (seenRequests.has(requestKey)) {
						continue;
					}
					seenRequests.add(requestKey);
				}
				if (proxy.method !== "GET" && proxy.method !== "HEAD") {
					continue;
				}
				if (
					website &&
					!isOriginAllowed(
						`https://${proxy.host}`,
						website.domain,
						allowedOrigins
					)
				) {
					foreignHosts += 1;
					continue;
				}

				const userAgent = (proxy.userAgent?.[0] ?? "").slice(0, 512);
				const setupNonce = setupCheckNonce(userAgent);
				if (setupNonce) {
					await redis.set(setupCheckKey(websiteId, setupNonce), "1", "EX", 120);
					continue;
				}
				const { botName, result } = detectBot(userAgent, request);
				const agent = identifyAiAgent({ userAgent }, result?.category);
				if (!agent) {
					continue;
				}

				const pathname = proxy.path.split("?")[0] ?? "";
				if (isAssetPath(pathname)) {
					continue;
				}
				spans.push({
					client_id: websiteId,
					timestamp: proxy.timestamp ?? parsed.data.timestamp ?? Date.now(),
					bot_type: agentBotCategory(agent),
					bot_name: botName ?? agent.operator,
					user_agent: userAgent,
					path: pathname.slice(0, 2048),
					format: contentFormatForPath(pathname),
					host: proxy.host,
					accept: "",
					referrer: proxy.referer?.slice(0, 2048),
					agent_id: agent.id,
					agent_purpose: agent.purpose,
					source: "vercel",
					status_code:
						proxy.statusCode && proxy.statusCode > 0 ? proxy.statusCode : 0,
					verification: website ? "" : "host_unchecked",
				});
			}

			if (spans.length > 0) {
				runFork(sendBatch("analytics-ai-traffic-spans", spans));
			}
			log.set({
				vercel: {
					entries: entries.length,
					stored: spans.length,
					malformed_lines: malformed,
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
