import { randomUUID } from "node:crypto";
import { and, db, eq, isNull, sql } from "@databuddy/db";
import { organization, websites } from "@databuddy/db/schema";
import {
	BUSINESS_CONTEXT_GENERATION_TIMEOUT,
	BUSINESS_CONTEXT_DRAFT_HISTORY_LIMIT,
	businessBriefSchema,
	businessTeamContextSchema,
	businessContextIsGenerating,
	organizationBusinessContextSchema,
	type BusinessBrief,
	type BusinessTeamContext,
	type OrganizationBusinessContext,
	type OrganizationBusinessProfile,
} from "@databuddy/shared/organization-business-context";
import { z } from "zod";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class BusinessContextError extends Error {
	readonly code: "NOT_FOUND" | "CONFLICT";
	constructor(code: "NOT_FOUND" | "CONFLICT", message: string) {
		super(message);
		this.code = code;
	}
}

function metadata(value: string | null): Record<string, unknown> {
	return value
		? z.record(z.string(), z.unknown()).parse(JSON.parse(value))
		: {};
}

function state(value: Record<string, unknown>): OrganizationBusinessContext {
	const result = organizationBusinessContextSchema.parse(
		value.businessContext ?? { profile: null, generation: null }
	);
	if (
		businessContextIsGenerating(result) &&
		result.generation &&
		Date.parse(result.generation.requestedAt) +
			BUSINESS_CONTEXT_GENERATION_TIMEOUT <
			Date.now()
	) {
		result.generation = {
			...result.generation,
			status: "failed",
			error:
				"Generation took too long. Try again; your saved context is unchanged.",
		};
	}
	return result;
}

export async function readOrganizationBusinessContext(
	organizationId: string
): Promise<OrganizationBusinessContext> {
	const row = await db.query.organization.findFirst({
		where: { id: organizationId },
		columns: { metadata: true },
	});
	if (!row) {
		throw new BusinessContextError("NOT_FOUND", "Organization not found");
	}
	return state(metadata(row.metadata));
}

async function update(
	organizationId: string,
	change: (
		current: OrganizationBusinessContext,
		tx: Transaction
	) => OrganizationBusinessContext | Promise<OrganizationBusinessContext>
): Promise<OrganizationBusinessContext> {
	return await db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL lock_timeout = '4s'`);
		const [row] = await tx
			.select({ metadata: organization.metadata })
			.from(organization)
			.where(eq(organization.id, organizationId))
			.for("no key update");
		if (!row) {
			throw new BusinessContextError("NOT_FOUND", "Organization not found");
		}
		const values = metadata(row.metadata);
		const next = organizationBusinessContextSchema.parse(
			await change(state(values), tx)
		);
		await tx
			.update(organization)
			.set({ metadata: JSON.stringify({ ...values, businessContext: next }) })
			.where(eq(organization.id, organizationId));
		return next;
	});
}

export async function beginBusinessContextGeneration(input: {
	organizationId: string;
	websiteId: string;
	requestedBy: string;
}): Promise<OrganizationBusinessContext> {
	return await update(input.organizationId, async (current, tx) => {
		const [site] = await tx
			.select({ id: websites.id, domain: websites.domain })
			.from(websites)
			.where(
				and(
					eq(websites.id, input.websiteId),
					eq(websites.organizationId, input.organizationId),
					isNull(websites.deletedAt)
				)
			)
			.for("update");
		if (!site) {
			throw new BusinessContextError(
				"NOT_FOUND",
				"Website not found in this organization"
			);
		}
		if (businessContextIsGenerating(current)) {
			return current;
		}
		const previousDrafts = [...(current.previousDrafts ?? [])];
		if (current.generation?.status === "ready" && current.generation.draft) {
			previousDrafts.push(current.generation);
		}
		return {
			...current,
			previousDrafts: previousDrafts.slice(
				-BUSINESS_CONTEXT_DRAFT_HISTORY_LIMIT
			),
			generation: {
				id: randomUUID(),
				websiteId: input.websiteId,
				domain: site.domain,
				requestedBy: input.requestedBy,
				requestedAt: new Date().toISOString(),
				baseRevision: current.profile?.revision ?? 0,
				status: "queued",
				draft: null,
				error: null,
			},
		};
	});
}

export async function markBusinessContextGeneration(input: {
	organizationId: string;
	generationId: string;
	status: "running" | "ready" | "failed";
	draft?: BusinessBrief;
	error?: string;
}): Promise<OrganizationBusinessContext> {
	return await update(input.organizationId, async (current, tx) => {
		const generation = current.generation;
		if (
			!generation ||
			generation.id !== input.generationId ||
			!businessContextIsGenerating(current)
		) {
			return current;
		}
		const [site] = await tx
			.select({ id: websites.id })
			.from(websites)
			.where(
				and(
					eq(websites.id, generation.websiteId),
					eq(websites.organizationId, input.organizationId),
					eq(websites.domain, generation.domain),
					isNull(websites.deletedAt)
				)
			)
			.for("update");
		if (!site) {
			return {
				...current,
				generation: {
					...generation,
					status: "failed",
					draft: null,
					error: "The source website is no longer in this organization.",
				},
			};
		}
		return {
			...current,
			generation: {
				...generation,
				status: input.status,
				draft:
					input.status === "ready" && input.draft
						? businessBriefSchema.parse(input.draft)
						: null,
				error:
					input.status === "failed"
						? (input.error ?? "Could not generate business context. Try again.")
						: null,
			},
		};
	});
}

export async function saveOrganizationBusinessProfile(input: {
	organizationId: string;
	revision: number;
	content: string;
	updatedBy: string;
	generationId?: string;
	teamContext?: BusinessTeamContext;
}): Promise<OrganizationBusinessContext> {
	return await update(input.organizationId, async (current, tx) => {
		if ((current.profile?.revision ?? 0) !== input.revision) {
			throw new BusinessContextError(
				"CONFLICT",
				"A newer brief was saved. Review the update before saving your edits."
			);
		}
		const generated = input.generationId
			? [current.generation, ...(current.previousDrafts ?? [])].find(
					(item) => item?.id === input.generationId
				)
			: null;
		if (
			input.generationId &&
			(generated?.id !== input.generationId ||
				generated.status !== "ready" ||
				!generated.draft)
		) {
			throw new BusinessContextError(
				"CONFLICT",
				"This AI draft is no longer available. Your edits are still here; save them as your own text."
			);
		}
		if (generated) {
			const [site] = await tx
				.select({ id: websites.id })
				.from(websites)
				.where(
					and(
						eq(websites.id, generated.websiteId),
						eq(websites.organizationId, input.organizationId),
						eq(websites.domain, generated.domain),
						isNull(websites.deletedAt)
					)
				)
				.for("update");
			if (!site) {
				throw new BusinessContextError(
					"CONFLICT",
					"The source website changed. Generate a new draft before saving."
				);
			}
		}
		const content = input.content.trim();
		const unchangedDraft = generated?.draft?.content === content;
		const unchangedSaved = !generated && current.profile?.content === content;
		// A small edit does not verify every inherited website claim. Manual changes
		// also invalidate the old page citations; prior versions retain their sources.
		let origin: OrganizationBusinessProfile["origin"] = "team";
		if (unchangedDraft) {
			origin =
				current.profile?.content && current.profile.origin !== "website"
					? "mixed"
					: "website";
		} else if (unchangedSaved && current.profile) {
			origin = current.profile.origin;
		} else if (
			generated ||
			(current.profile && current.profile.origin !== "team")
		) {
			origin = "mixed";
		}
		const brief = businessBriefSchema.parse({
			content,
			sources: unchangedDraft
				? (generated?.draft?.sources ?? [])
				: unchangedSaved
					? (current.profile?.sources ?? [])
					: [],
		});
		return {
			history: profileHistory(current),
			profile: {
				...brief,
				origin,
				revision: input.revision + 1,
				updatedAt: new Date().toISOString(),
				updatedBy: input.updatedBy,
				teamContext: input.teamContext
					? businessTeamContextSchema.parse(input.teamContext)
					: current.profile?.teamContext,
				sourceWebsiteId: unchangedDraft
					? (generated?.websiteId ?? null)
					: unchangedSaved
						? (current.profile?.sourceWebsiteId ?? null)
						: null,
			},
			generation: null,
		};
	});
}

function profileHistory(current: OrganizationBusinessContext) {
	return [
		...(current.history ?? []),
		...(current.profile ? [current.profile] : []),
	].slice(-BUSINESS_CONTEXT_DRAFT_HISTORY_LIMIT);
}

export async function cancelBusinessContextGeneration(input: {
	organizationId: string;
	generationId: string;
}): Promise<OrganizationBusinessContext> {
	return await update(input.organizationId, (current) => ({
		...current,
		generation:
			current.generation?.id === input.generationId ? null : current.generation,
		previousDrafts: current.previousDrafts?.filter(
			(draft) => draft.id !== input.generationId
		),
	}));
}

export async function restoreOrganizationBusinessProfile(input: {
	organizationId: string;
	revision: number;
	restoreRevision: number;
	updatedBy: string;
}): Promise<OrganizationBusinessContext> {
	return await update(input.organizationId, (current) => {
		if ((current.profile?.revision ?? 0) !== input.revision) {
			throw new BusinessContextError(
				"CONFLICT",
				"A newer brief was saved. Review the update before restoring this version."
			);
		}
		const previous = current.history?.find(
			(profile) => profile.revision === input.restoreRevision
		);
		if (!previous) {
			throw new BusinessContextError(
				"NOT_FOUND",
				"This version is no longer available."
			);
		}
		return {
			profile: {
				...previous,
				revision: input.revision + 1,
				updatedAt: new Date().toISOString(),
				updatedBy: input.updatedBy,
			},
			history: profileHistory(current),
			generation: null,
		};
	});
}
