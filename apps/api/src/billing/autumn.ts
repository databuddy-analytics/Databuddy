import { auth } from "@databuddy/auth";
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

export async function handleAutumnRequest(request: Request) {
	const sanitized = await stripPrivilegedBody(request);
	return autumn(withAutumnApiPath(sanitized));
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
