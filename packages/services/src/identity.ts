import { createHash, createHmac } from "node:crypto";
import { db, profileAliases, profiles, sql } from "@databuddy/db";
import { decrypt, encrypt } from "@databuddy/encryption";

const ENCRYPTED_PREFIX = "v1:";

function identitySecret(): string {
	return process.env.DATABUDDY_ENCRYPTION_KEY || "";
}

export function protectPii(value: string): string {
	const secret = identitySecret();
	return secret ? encrypt(value, secret) : value;
}

export function revealPii(value: string | null): string | null {
	if (!(value && value.startsWith(ENCRYPTED_PREFIX))) {
		return value;
	}
	const secret = identitySecret();
	if (!secret) {
		return null;
	}
	try {
		return decrypt(value, secret);
	} catch {
		return null;
	}
}

export function emailLookupHash(email: string): string {
	const normalized = email.trim().toLowerCase();
	const secret = identitySecret();
	return secret
		? createHmac("sha256", secret).update(normalized).digest("hex")
		: createHash("sha256").update(normalized).digest("hex");
}

export type TraitValue = string | number | boolean | null;

export interface SplitTraits {
	displayName: string | null | undefined;
	email: string | null | undefined;
	removeKeys: string[];
	rest: Record<string, unknown>;
}

function normalizeDisplayTrait(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function splitTraits(
	traits: Record<string, TraitValue> | null | undefined
): SplitTraits {
	let username: string | null | undefined;
	let name: string | null | undefined;
	let email: string | null | undefined;
	const rest: Record<string, unknown> = {};
	const removeKeys: string[] = [];

	for (const [key, value] of Object.entries(traits ?? {})) {
		if (key === "username") {
			username = normalizeDisplayTrait(value);
		} else if (key === "name") {
			name = normalizeDisplayTrait(value);
		} else if (key === "email") {
			email =
				typeof value === "string" && value.trim()
					? value.trim().toLowerCase()
					: null;
		} else if (value === null) {
			removeKeys.push(key);
		} else {
			rest[key] = value;
		}
	}

	return {
		displayName: username === undefined ? name : (username ?? name ?? null),
		email,
		rest,
		removeKeys,
	};
}

export async function upsertProfile(
	websiteId: string,
	profileId: string,
	split: SplitTraits
): Promise<void> {
	const { displayName, email, rest, removeKeys } = split;
	const hasTraitUpdates =
		displayName !== undefined ||
		email !== undefined ||
		removeKeys.length > 0 ||
		Object.keys(rest).length > 0;

	const protectedDisplayName = displayName ? protectPii(displayName) : null;
	const protectedEmail = email ? protectPii(email) : null;
	const emailHash = email ? emailLookupHash(email) : null;

	const insert = db.insert(profiles).values({
		websiteId,
		profileId,
		displayName: protectedDisplayName,
		email: protectedEmail,
		emailHash,
		traits: rest,
	});

	if (!hasTraitUpdates) {
		await insert.onConflictDoNothing();
		return;
	}

	const mergedTraits =
		removeKeys.length > 0
			? sql`(${profiles.traits} - ${removeKeys}::text[]) || ${JSON.stringify(rest)}::jsonb`
			: sql`${profiles.traits} || ${JSON.stringify(rest)}::jsonb`;

	await insert.onConflictDoUpdate({
		target: [profiles.websiteId, profiles.profileId],
		set: {
			...(displayName !== undefined && { displayName: protectedDisplayName }),
			...(email !== undefined && { email: protectedEmail, emailHash }),
			traits: mergedTraits,
			updatedAt: sql`now()`,
		},
	});
}

export async function upsertAlias(
	websiteId: string,
	anonymousId: string,
	profileId: string
): Promise<void> {
	await db
		.insert(profileAliases)
		.values({ websiteId, anonymousId, profileId })
		.onConflictDoUpdate({
			target: [profileAliases.websiteId, profileAliases.anonymousId],
			set: { profileId },
			setWhere: sql`${profileAliases.profileId} is distinct from excluded.profile_id`,
		});
}
