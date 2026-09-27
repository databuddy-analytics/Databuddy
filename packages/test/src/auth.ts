import { auth } from "@databuddy/auth";
import { member as memberTable } from "@databuddy/db/schema";
import { db } from "./db";
import { nextId } from "./factories/id";

export interface AuthUser {
	email: string;
	headers: Headers;
	id: string;
}

export async function signUp(
	overrides: { email?: string; name?: string; password?: string } = {}
): Promise<AuthUser> {
	const id = nextId("auth");
	const email = overrides.email ?? `${id}@test.local`;
	const name = overrides.name ?? `User ${id}`;
	const password = overrides.password ?? "test-password-123!";

	await auth.api.signUpEmail({ body: { email, name, password } });

	const res = await auth.api.signInEmail({
		body: { email, password },
		returnHeaders: true,
	});

	const sessionCookie = res.headers
		.getSetCookie()
		.find((c) => c.startsWith("databuddy-dev.session_token="))
		?.split(";")[0];
	if (!sessionCookie) {
		throw new Error(`signUp: no session cookie returned for ${email}`);
	}

	const userId = res.response.user.id;
	if (!userId) {
		throw new Error(`signUp: sign-in returned no user id for ${email}`);
	}

	return {
		headers: new Headers({ cookie: sessionCookie }),
		id: userId,
		email,
	};
}

export async function addToOrganization(
	userId: string,
	organizationId: string,
	role = "member"
) {
	const [row] = await db()
		.insert(memberTable)
		.values({
			id: nextId("member"),
			userId,
			organizationId,
			role,
			createdAt: new Date(),
		})
		.returning();
	return row;
}
