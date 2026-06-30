import { randomUUID } from "node:crypto";
import { auth } from "@databuddy/auth";
import { and, db, eq } from "@databuddy/db";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	member,
	organization,
	session,
	user,
	websites,
} from "@databuddy/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_KEY_HEADER = "x-e2e-test-key";
const E2E_EMAIL_DOMAIN = "e2e.databuddy.local";
const E2E_PASSWORD = "DatabuddyE2E!123";

interface SessionBody {
	runScope?: unknown;
	testScope?: unknown;
	withWebsite?: unknown;
}

function isE2EModeEnabled(): boolean {
	return readBooleanEnv("DATABUDDY_E2E_MODE");
}

function notFound(): Response {
	return Response.json({ error: "Not found" }, { status: 404 });
}

function assertE2EAccess(request: Request): Response | null {
	if (!isE2EModeEnabled()) {
		return notFound();
	}
	const key = process.env.DATABUDDY_E2E_TEST_KEY;
	if (!key) {
		return notFound();
	}
	if (request.headers.get(TEST_KEY_HEADER) !== key) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return null;
}

function normalizeScope(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}
	const normalized = value
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]+/g, "-")
		.replaceAll(/-+/g, "-")
		.replaceAll(/^[-_]+|[-_]+$/g, "")
		.slice(0, 48);
	return normalized || fallback;
}

function identityFromBody(body: SessionBody) {
	const runScope = normalizeScope(body.runScope, "run");
	const testScope = normalizeScope(
		body.testScope,
		`test-${Date.now()}-${Math.floor(Math.random() * 100_000)}`
	);
	const key = `${runScope}-${testScope}`;
	return {
		email: `e2e+${key}@${E2E_EMAIL_DOMAIN}`,
		name: `E2E ${testScope}`,
		orgName: `E2E Workspace ${runScope}`,
	};
}

async function ensureUser(email: string, name: string): Promise<string> {
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	if (existing) {
		return existing.id;
	}

	await auth.api.signUpEmail({
		body: {
			email,
			name,
			password: E2E_PASSWORD,
		},
	});

	const [created] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);
	if (!created) {
		throw new Error("Failed to create E2E user");
	}
	return created.id;
}

async function ensureOrganization(
	userId: string,
	orgName: string
): Promise<{ id: string; name: string }> {
	const [existing] = await db
		.select({ organizationId: member.organizationId, name: organization.name })
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(eq(member.userId, userId))
		.limit(1);
	if (existing) {
		return { id: existing.organizationId, name: existing.name };
	}

	const orgId = randomUUID();
	await db.insert(organization).values({
		id: orgId,
		name: orgName,
		createdAt: new Date(),
	});
	await db.insert(member).values({
		id: randomUUID(),
		organizationId: orgId,
		userId,
		role: "owner",
		createdAt: new Date(),
	});
	return { id: orgId, name: orgName };
}

async function ensureWebsite(organizationId: string) {
	const [existing] = await db
		.select({ id: websites.id })
		.from(websites)
		.where(
			and(
				eq(websites.organizationId, organizationId),
				eq(websites.domain, "e2e.databuddy.local")
			)
		)
		.limit(1);
	if (existing) {
		return existing.id;
	}

	const [created] = await db
		.insert(websites)
		.values({
			id: randomUUID(),
			domain: "e2e.databuddy.local",
			name: "E2E Website",
			organizationId,
		})
		.returning({ id: websites.id });
	return created?.id ?? null;
}

function signIn(email: string) {
	return auth.api.signInEmail({
		body: {
			email,
			password: E2E_PASSWORD,
			rememberMe: true,
		},
		returnHeaders: true,
	});
}

export async function POST(request: Request): Promise<Response> {
	const denied = assertE2EAccess(request);
	if (denied) {
		return denied;
	}

	const body = (await request.json().catch(() => ({}))) as SessionBody;
	const identity = identityFromBody(body);
	const userId = await ensureUser(identity.email, identity.name);
	const primaryOrganization = await ensureOrganization(
		userId,
		identity.orgName
	);
	const organizationId = primaryOrganization.id;
	const websiteId =
		body.withWebsite === false ? null : await ensureWebsite(organizationId);
	const signInResponse = await signIn(identity.email);
	await db
		.update(session)
		.set({ activeOrganizationId: organizationId })
		.where(eq(session.userId, userId));

	const headers = new Headers({ "content-type": "application/json" });
	const cookies = signInResponse.headers.getSetCookie?.() ?? [];
	if (cookies.length > 0) {
		for (const cookie of cookies) {
			headers.append("set-cookie", cookie);
		}
	} else {
		const cookie = signInResponse.headers.get("set-cookie");
		if (cookie) {
			headers.append("set-cookie", cookie);
		}
	}

	return new Response(
		JSON.stringify({
			email: identity.email,
			name: identity.name,
			organizationId,
			organizationName: primaryOrganization.name,
			userId,
			websiteId,
		}),
		{ headers }
	);
}
