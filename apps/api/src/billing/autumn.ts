import { auth } from "@databuddy/auth";
import { getRedisCache } from "@databuddy/redis";
import { getBillingCustomerId, getMemberRole } from "@databuddy/rpc";
import { autumnHandler } from "autumn-js/fetch";
import { useLogger } from "evlog/elysia";
import { withAutumnApiPath } from "@/lib/autumn-mount";

const FORBIDDEN_BODY_KEYS = new Set([
	"customize",
	"invoiceMode",
	"noBillingChanges",
	"enablePlanImmediately",
	"processorSubscriptionId",
	"processorSubId",
	"checkoutSessionParams",
	"customLineItems",
	"successUrl",
	"returnUrl",
	"cancelUrl",
	"trialEnd",
	"billingCycleAnchor",
	"prorationBehavior",
]);

function sanitize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sanitize);
	}
	if (!value || typeof value !== "object") {
		return value;
	}
	const out: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(value)) {
		if (FORBIDDEN_BODY_KEYS.has(key)) {
			continue;
		}
		out[key] = sanitize(val);
	}
	return out;
}

async function stripPrivilegedBody(request: Request): Promise<Request> {
	if (request.method === "GET" || request.method === "HEAD") {
		return request;
	}
	const contentType = request.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return request;
	}

	const text = await request.text();
	let body: string | null = text || null;
	if (text) {
		try {
			body = JSON.stringify(sanitize(JSON.parse(text)));
		} catch {
			body = text;
		}
	}

	return new Request(request.url, {
		method: request.method,
		headers: request.headers,
		body,
	});
}

const autumn = autumnHandler({ identify: identifyAutumnCustomer });

const AUTUMN_CACHE_TTL_SEC: Record<string, number> = {
	getOrCreateCustomer: 30,
	listPlans: 300,
};

function autumnPathSegment(request: Request): string {
	const { pathname } = new URL(request.url);
	return pathname.split("/").at(-1) ?? "";
}

function autumnCacheKey(segment: string, customerId: string): string {
	return `autumn:proxy:${segment}:${customerId}`;
}

async function invalidateAutumnCustomerCache(request: Request) {
	const identity = await identifyAutumnCustomer(request).catch(() => null);
	if (!identity?.customerId) {
		return;
	}
	await getRedisCache()
		.del(autumnCacheKey("getOrCreateCustomer", identity.customerId))
		.catch(() => {});
}

async function readAutumnCache(key: string): Promise<Response | null> {
	const hit = await getRedisCache()
		.get(key)
		.catch(() => null);
	if (!hit) {
		return null;
	}
	try {
		const { body, contentType } = JSON.parse(hit) as {
			body: string;
			contentType: string;
		};
		return new Response(body, {
			status: 200,
			headers: { "content-type": contentType },
		});
	} catch {
		return null;
	}
}

async function writeAutumnCache(
	key: string,
	ttlSec: number,
	response: Response
) {
	const body = await response.clone().text();
	await getRedisCache()
		.setex(
			key,
			ttlSec,
			JSON.stringify({
				body,
				contentType: response.headers.get("content-type") ?? "application/json",
			})
		)
		.catch(() => {});
}

export async function handleAutumnRequest(request: Request) {
	const sanitized = await stripPrivilegedBody(request);
	const segment = autumnPathSegment(sanitized);
	const ttlSec = AUTUMN_CACHE_TTL_SEC[segment];

	if (ttlSec === undefined) {
		const response = await autumn(withAutumnApiPath(sanitized));
		if (response.ok) {
			await invalidateAutumnCustomerCache(sanitized);
		}
		return response;
	}

	const identity = await identifyAutumnCustomer(sanitized).catch(() => null);
	if (!identity?.customerId) {
		return autumn(withAutumnApiPath(sanitized));
	}

	const key = autumnCacheKey(segment, identity.customerId);
	const cached = await readAutumnCache(key);
	if (cached) {
		return cached;
	}

	const response = await autumn(withAutumnApiPath(sanitized));
	if (response.status === 200) {
		await writeAutumnCache(key, ttlSec, response);
	}
	return response;
}

async function loadSession(request: Request) {
	try {
		return await auth.api.getSession({ headers: request.headers });
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		useLogger().error(err, {
			autumn: "identify",
			autumn_stage: "getSession",
		});
		throw err;
	}
}

async function identifyAutumnCustomer(request: Request) {
	const session = await loadSession(request);
	if (!session?.user) {
		return null;
	}

	const activeOrgId = session.session.activeOrganizationId ?? null;

	if (activeOrgId) {
		const role = await getMemberRole(session.user.id, activeOrgId);
		if (role !== "owner" && role !== "admin") {
			return null;
		}
	}

	const customerId = await getBillingCustomerId(session.user.id, activeOrgId);

	return {
		customerId,
		customerData: {
			name: session.user.name,
			email: session.user.email,
		},
	};
}
