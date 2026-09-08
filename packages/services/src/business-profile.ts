import { and, db, eq, isNull, sql } from "@databuddy/db";
import {
	type BusinessProfileRecord,
	websiteBusinessContexts,
	websites,
} from "@databuddy/db/schema";
import {
	type BusinessProfile,
	businessProfileSchema,
} from "@databuddy/shared/business-context";
import {
	businessContainerTag,
	type BusinessScope,
	canonicalBusinessScope,
} from "./business-memory";

type Scope = BusinessScope & { startedAt: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function profileMatchesScope(scope: Scope, profile: BusinessProfile): boolean {
	const started = Date.parse(scope.startedAt);
	const captured = Date.parse(profile.capturedAt);
	return (
		captured >= started &&
		profile.sources.every((source) => {
			const observed = Date.parse(source.observedAt);
			if (
				observed < started ||
				observed > captured ||
				(source.expiresAt && Date.parse(source.expiresAt) <= observed)
			) {
				return false;
			}
			if (source.kind === "team_reply") {
				return source.content.length <= 4000;
			}
			if (!source.url) {
				return false;
			}
			const url = new URL(source.url);
			return (
				(url.protocol === "https:" || url.protocol === "http:") &&
				!url.username &&
				!url.password &&
				!url.port &&
				canonicalBusinessScope({ ...scope, domain: url.hostname }).domain ===
					scope.domain
			);
		})
	);
}

function canonicalScope(scope: Scope): Scope {
	const canonical = canonicalBusinessScope(scope);
	if (!canonical.startedAt) {
		throw new Error("Business profiles require an initialized scope");
	}
	return { ...canonical, startedAt: canonical.startedAt };
}

async function lockWebsite(tx: Transaction, scope: Scope): Promise<boolean> {
	await tx.execute(sql`SET LOCAL lock_timeout = '4s'`);
	const [site] = await tx
		.select({ domain: websites.domain, settings: websites.settings })
		.from(websites)
		.where(
			and(
				eq(websites.id, scope.websiteId),
				eq(websites.organizationId, scope.organizationId),
				isNull(websites.deletedAt)
			)
		)
		.limit(1)
		.for("update");
	return Boolean(
		site?.settings?.businessContextStartedAt &&
			businessContainerTag({
				...scope,
				domain: site.domain,
				startedAt: site.settings.businessContextStartedAt,
			}) === businessContainerTag(scope)
	);
}

export async function loadBusinessProfileRecord(
	input: Scope,
	asOf: Date,
	database: Pick<typeof db, "select"> = db
): Promise<BusinessProfileRecord | null> {
	const scope = canonicalScope(input);
	const [result] = await database
		.select({
			record: websiteBusinessContexts,
			domain: websites.domain,
			settings: websites.settings,
		})
		.from(websiteBusinessContexts)
		.innerJoin(websites, eq(websites.id, websiteBusinessContexts.websiteId))
		.where(
			and(
				eq(websiteBusinessContexts.websiteId, scope.websiteId),
				eq(websiteBusinessContexts.organizationId, scope.organizationId),
				eq(websiteBusinessContexts.domain, scope.domain),
				eq(websiteBusinessContexts.startedAt, scope.startedAt),
				eq(websites.organizationId, scope.organizationId),
				isNull(websites.deletedAt)
			)
		)
		.limit(1);
	if (
		!result?.settings?.businessContextStartedAt ||
		businessContainerTag({
			...scope,
			domain: result.domain,
			startedAt: result.settings.businessContextStartedAt,
		}) !== businessContainerTag(scope)
	) {
		return null;
	}
	const parsed = businessProfileSchema.safeParse(result.record.profile);
	if (
		!(
			parsed.success &&
			profileMatchesScope(scope, parsed.data) &&
			Date.parse(parsed.data.capturedAt) <= asOf.getTime()
		)
	) {
		return null;
	}
	return { ...result.record, profile: parsed.data };
}

export async function saveBusinessProfileRecord(
	input: Scope,
	profile: BusinessProfile,
	options: { expectedRevision: number | null; refreshAfter: Date },
	database = db
): Promise<BusinessProfileRecord | null> {
	const scope = canonicalScope(input);
	const parsed = businessProfileSchema.parse(profile);
	if (!profileMatchesScope(scope, parsed)) {
		return null;
	}
	return await database.transaction(async (tx) => {
		if (!(await lockWebsite(tx, scope))) {
			return null;
		}
		const [current] = await tx
			.select()
			.from(websiteBusinessContexts)
			.where(eq(websiteBusinessContexts.websiteId, scope.websiteId))
			.for("update");
		const revision =
			current && businessContainerTag(current) === businessContainerTag(scope)
				? current.revision
				: null;
		if (revision !== options.expectedRevision) {
			return null;
		}
		const values = {
			...scope,
			profile: parsed,
			revision: (current?.revision ?? 0) + 1,
			refreshAfter: options.refreshAfter,
			updatedAt: new Date(),
			indexedRevision: null,
		};
		const [record] = await tx
			.insert(websiteBusinessContexts)
			.values(values)
			.onConflictDoUpdate({
				target: websiteBusinessContexts.websiteId,
				set: values,
			})
			.returning();
		return record ?? null;
	});
}

export async function markBusinessProfileIndexed(
	input: Scope,
	revision: number,
	database = db
): Promise<BusinessProfileRecord | null> {
	const scope = canonicalScope(input);
	return await database.transaction(async (tx) => {
		if (!(await lockWebsite(tx, scope))) {
			return null;
		}
		const [record] = await tx
			.update(websiteBusinessContexts)
			.set({ indexedRevision: revision })
			.where(
				and(
					eq(websiteBusinessContexts.websiteId, scope.websiteId),
					eq(websiteBusinessContexts.organizationId, scope.organizationId),
					eq(websiteBusinessContexts.domain, scope.domain),
					eq(websiteBusinessContexts.startedAt, scope.startedAt),
					eq(websiteBusinessContexts.revision, revision)
				)
			)
			.returning();
		return record ?? null;
	});
}
