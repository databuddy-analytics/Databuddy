import { db, profileAliases, profiles, sql } from "@databuddy/db";

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

	const insert = db.insert(profiles).values({
		websiteId,
		profileId,
		displayName: displayName ?? null,
		email: email ?? null,
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
			...(displayName !== undefined && { displayName }),
			...(email !== undefined && { email }),
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
