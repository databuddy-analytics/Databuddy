import { createHmac } from "node:crypto";
import { compare } from "@databuddy/encryption";

export interface SlackOAuthState {
	expiresAt: number;
	nonce: string;
	organizationId: string;
	userId: string;
}

function signStatePayload(payload: string, secret: string): string {
	const digest = createHmac("sha256", secret).update(payload).digest();
	return Buffer.from(digest).toString("base64url");
}

function parseStatePayload(value: unknown): SlackOAuthState | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const state = value as Partial<SlackOAuthState>;
	if (
		typeof state.expiresAt !== "number" ||
		typeof state.nonce !== "string" ||
		typeof state.organizationId !== "string" ||
		typeof state.userId !== "string"
	) {
		return null;
	}
	if (
		!(
			state.expiresAt > 0 &&
			state.nonce &&
			state.organizationId &&
			state.userId
		)
	) {
		return null;
	}
	return {
		expiresAt: state.expiresAt,
		nonce: state.nonce,
		organizationId: state.organizationId,
		userId: state.userId,
	};
}

export function createSlackOAuthState(
	state: SlackOAuthState,
	secret: string
): string {
	const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
	const signature = signStatePayload(payload, secret);
	return `${payload}.${signature}`;
}

export function verifySlackOAuthState(
	state: string,
	secret: string,
	now = Date.now()
): SlackOAuthState | null {
	const [payload, signature, extra] = state.split(".");
	if (!(payload && signature) || extra !== undefined) {
		return null;
	}

	const expectedSignature = signStatePayload(payload, secret);
	if (!compare(signature, expectedSignature)) {
		return null;
	}

	try {
		const parsed = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8")
		);
		const verified = parseStatePayload(parsed);
		if (!verified || verified.expiresAt < now) {
			return null;
		}
		return verified;
	} catch {
		return null;
	}
}
