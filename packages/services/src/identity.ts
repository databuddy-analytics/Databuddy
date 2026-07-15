import { createHash, createHmac } from "node:crypto";
import {
	and,
	db,
	eq,
	profileAliases,
	profiles,
	profileTraitChanges,
	sql,
} from "@databuddy/db";
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

export interface TraitChange {
	newValue: TraitValue;
	oldValue: TraitValue;
	traitKey: string;
}

export interface ProfileTraitUpdate {
	changes: TraitChange[];
	traits: Record<string, unknown>;
}

function asTraitValue(value: unknown): TraitValue {
	return typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
		? value
		: null;
}

export function applyTraits(
	existing: Record<string, unknown>,
	rest: Record<string, unknown>,
	removeKeys: string[]
): ProfileTraitUpdate {
	const changes: TraitChange[] = [];
	const traits = { ...existing };

	for (const [key, value] of Object.entries(rest)) {
		if (asTraitValue(existing[key]) !== asTraitValue(value)) {
			changes.push({
				traitKey: key,
				oldValue: asTraitValue(existing[key]),
				newValue: asTraitValue(value),
			});
		}
		traits[key] = value;
	}

	for (const key of removeKeys) {
		if (key in existing) {
			changes.push({
				traitKey: key,
				oldValue: asTraitValue(existing[key]),
				newValue: null,
			});
		}
		delete traits[key];
	}

	return { changes, traits };
}

export async function upsertProfile(
	websiteId: string,
	profileId: string,
	split: SplitTraits,
	source = "identify"
): Promise<ProfileTraitUpdate | null> {
	const { displayName, email, rest, removeKeys } = split;
	const hasTraitUpdates =
		displayName !== undefined ||
		email !== undefined ||
		removeKeys.length > 0 ||
		Object.keys(rest).length > 0;

	const protectedDisplayName = displayName ? protectPii(displayName) : null;
	const protectedEmail = email ? protectPii(email) : null;
	const emailHash = email ? emailLookupHash(email) : null;

	const values = {
		websiteId,
		profileId,
		displayName: protectedDisplayName,
		email: protectedEmail,
		emailHash,
		traits: rest,
	};

	if (!hasTraitUpdates) {
		await db.insert(profiles).values(values).onConflictDoNothing();
		return null;
	}

	const mergedTraits =
		removeKeys.length > 0
			? sql`(${profiles.traits} - ${removeKeys}::text[]) || ${JSON.stringify(rest)}::jsonb`
			: sql`${profiles.traits} || ${JSON.stringify(rest)}::jsonb`;

	return await db.transaction(async (tx) => {
		// FOR UPDATE can't lock a not-yet-existent row, so two concurrent
		// first-time identifies would both read {} and write conflicting
		// history. Serialize on the (websiteId, profileId) pair instead.
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`profile:${websiteId}:${profileId}`}, 0))`
		);

		const existingRows = await tx
			.select({ traits: profiles.traits })
			.from(profiles)
			.where(
				and(
					eq(profiles.websiteId, websiteId),
					eq(profiles.profileId, profileId)
				)
			)
			.limit(1);
		const existingTraits = (existingRows[0]?.traits ?? {}) as Record<
			string,
			unknown
		>;

		await tx
			.insert(profiles)
			.values(values)
			.onConflictDoUpdate({
				target: [profiles.websiteId, profiles.profileId],
				set: {
					...(displayName !== undefined && {
						displayName: protectedDisplayName,
					}),
					...(email !== undefined && { email: protectedEmail, emailHash }),
					traits: mergedTraits,
					updatedAt: sql`now()`,
				},
			});

		const update = applyTraits(existingTraits, rest, removeKeys);
		if (update.changes.length > 0) {
			await tx.insert(profileTraitChanges).values({
				id: crypto.randomUUID(),
				websiteId,
				profileId,
				traits: update.traits,
				changes: Object.fromEntries(
					update.changes.map((change) => [
						change.traitKey,
						{ old: change.oldValue, new: change.newValue },
					])
				),
				source,
			});
		}
		return update;
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

export const TRAIT_FILTER_PREFIX = "trait:";
export const TRAIT_SEGMENT_LIMIT = 10_000;

export interface TraitFilter {
	field: string;
	op: "eq" | "ne" | "in" | "not_in";
	value: string | number | (string | number)[];
}

export class TraitFilterError extends Error {}

export function isTraitFilterField(field: string): boolean {
	return (
		typeof field === "string" &&
		field.startsWith(TRAIT_FILTER_PREFIX) &&
		field.length > TRAIT_FILTER_PREFIX.length
	);
}

function traitValueList(value: TraitFilter["value"]) {
	const values = Array.isArray(value) ? value : [value];
	return sql.join(
		values.map((item) => sql`${String(item)}`),
		sql`, `
	);
}

function traitCondition(filter: TraitFilter) {
	const key = filter.field.slice(TRAIT_FILTER_PREFIX.length);
	const extracted = sql`${profiles.traits}->>${key}`;
	const isEmptyList = Array.isArray(filter.value) && filter.value.length === 0;
	switch (filter.op) {
		case "eq":
			return sql`${extracted} = ${String(filter.value)}`;
		case "ne":
			return sql`${extracted} is distinct from ${String(filter.value)}`;
		case "in":
			return isEmptyList
				? sql`false`
				: sql`${extracted} in (${traitValueList(filter.value)})`;
		case "not_in":
			return isEmptyList
				? sql`true`
				: sql`(${extracted} is null or ${extracted} not in (${traitValueList(filter.value)}))`;
		default:
			throw new TraitFilterError(
				`Trait filters do not support the ${filter.op as string} operator.`
			);
	}
}

export async function resolveTraitSegment(
	websiteId: string,
	traitFilters: TraitFilter[]
): Promise<string[]> {
	const rows = await db
		.select({ profileId: profiles.profileId })
		.from(profiles)
		.where(
			and(
				eq(profiles.websiteId, websiteId),
				...traitFilters.map(traitCondition)
			)
		)
		.limit(TRAIT_SEGMENT_LIMIT + 1);

	if (rows.length > TRAIT_SEGMENT_LIMIT) {
		throw new TraitFilterError(
			`Trait segment exceeds ${TRAIT_SEGMENT_LIMIT} profiles, narrow the filter.`
		);
	}
	return rows.map((row) => row.profileId);
}

export interface TraitDistributionRow {
	key: string;
	profiles: number;
	value: string;
}

interface TraitDistributionQueryRow
	extends TraitDistributionRow,
		Record<string, unknown> {
	distinct_value_count: number;
	total_trait_keys: number;
	values_per_key: number;
}

const TRAIT_DISTRIBUTION_ROW_LIMIT = 200;
const MAX_TRAIT_VALUES_PER_KEY = 20;

export async function getTraitDistribution(websiteId: string): Promise<{
	hasMoreKeys: boolean;
	hasMoreValues: boolean;
	identifiedProfiles: number;
	returnedTraitKeys: number;
	totalTraitKeys: number;
	traits: TraitDistributionRow[];
	valuesPerKey: number;
}> {
	const [totals] = await db
		.select({ identifiedProfiles: sql<number>`count(*)::int` })
		.from(profiles)
		.where(eq(profiles.websiteId, websiteId));

	const result = await db.execute<TraitDistributionQueryRow>(sql`
		with trait_values as (
			select
				t.key as key,
				t.value as value,
				count(*)::int as profiles
			from ${profiles} p, jsonb_each_text(p.traits) as t(key, value)
			where p.website_id = ${websiteId}
				and jsonb_typeof(p.traits) = 'object'
			group by t.key, t.value
		),
		ranked as (
			select
				key,
				value,
				profiles,
				(row_number() over (
					partition by key
					order by profiles desc, value asc
				))::int as value_rank,
				(count(*) over (partition by key))::int as distinct_value_count
			from trait_values
		),
		key_coverage as (
			select key, sum(profiles)::bigint as profile_coverage
			from trait_values
			group by key
		),
		selected_keys as (
			select key, total_trait_keys
			from (
				select
					key,
					profile_coverage,
					(count(*) over ())::int as total_trait_keys
				from key_coverage
			) keys
			order by profile_coverage desc, key asc
			limit ${TRAIT_DISTRIBUTION_ROW_LIMIT}
		),
		budget as (
			select greatest(
				1,
				least(
					${MAX_TRAIT_VALUES_PER_KEY},
					floor(${TRAIT_DISTRIBUTION_ROW_LIMIT}::numeric / greatest(count(*), 1))::int
				)
			)::int as values_per_key
			from selected_keys
		)
		select
			ranked.key,
			ranked.value,
			ranked.profiles,
			ranked.distinct_value_count,
			selected_keys.total_trait_keys,
			budget.values_per_key
		from ranked
		inner join selected_keys on selected_keys.key = ranked.key
		cross join budget
		where ranked.value_rank <= budget.values_per_key
		order by ranked.key asc, ranked.profiles desc, ranked.value asc
	`);
	const rows = result.rows;
	const valuesPerKey = rows[0]?.values_per_key ?? 0;
	const totalTraitKeys = rows[0]?.total_trait_keys ?? 0;
	const returnedTraitKeys = new Set(rows.map((row) => row.key)).size;

	return {
		hasMoreKeys: returnedTraitKeys < totalTraitKeys,
		hasMoreValues: rows.some((row) => row.distinct_value_count > valuesPerKey),
		identifiedProfiles: totals?.identifiedProfiles ?? 0,
		returnedTraitKeys,
		totalTraitKeys,
		traits: rows.map((row) => ({
			key: row.key,
			profiles: row.profiles,
			value: row.value,
		})),
		valuesPerKey,
	};
}
