import { randomUUID } from "node:crypto";
import { and, db, eq, isNull, sql } from "@databuddy/db";
import { organization, websites } from "@databuddy/db/schema";
import {
	BUSINESS_CONTEXT_GENERATION_TIMEOUT,
	businessBriefSchema,
	businessContextIsGenerating,
	organizationBusinessContextSchema,
	type BusinessBrief,
	type OrganizationBusinessContext,
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
		return {
			...current,
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
}): Promise<OrganizationBusinessContext> {
	return await update(input.organizationId, async (current, tx) => {
		if ((current.profile?.revision ?? 0) !== input.revision) {
			throw new BusinessContextError(
				"CONFLICT",
				"Business context changed since you opened it. Reload the saved version before saving your changes."
			);
		}
		const generated = input.generationId ? current.generation : null;
		if (
			input.generationId &&
			(generated?.id !== input.generationId ||
				generated.status !== "ready" ||
				!generated.draft)
		) {
			throw new BusinessContextError(
				"CONFLICT",
				"The generated draft has changed. Reload before saving."
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
		const brief = businessBriefSchema.parse({
			content: input.content,
			sources: generated?.draft?.sources ?? current.profile?.sources ?? [],
		});
		let origin: "team" | "website" = "team";
		if (generated?.draft?.content === brief.content) {
			origin =
				current.profile?.origin === "team" && current.profile.content
					? "team"
					: "website";
		} else if (!generated && current.profile?.content === brief.content) {
			origin = current.profile.origin;
		}
		return {
			profile: {
				...brief,
				origin,
				revision: input.revision + 1,
				updatedAt: new Date().toISOString(),
				updatedBy: input.updatedBy,
				sourceWebsiteId:
					generated?.websiteId ?? current.profile?.sourceWebsiteId ?? null,
			},
			generation: null,
		};
	});
}
