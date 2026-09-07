import { createHash } from "node:crypto";
import type { db } from "@databuddy/db";
import Supermemory from "supermemory";
import { z } from "zod";

export interface BusinessScope {
	domain: string;
	organizationId: string;
	startedAt?: string;
	websiteId: string;
}

let client: Supermemory | null = null;

export function getMemoryClient(): Supermemory | null {
	const apiKey = process.env.SUPERMEMORY_API_KEY;
	if (!apiKey) {
		return null;
	}
	client ??= new Supermemory({ apiKey });
	return client;
}

export function canonicalBusinessScope(scope: BusinessScope): BusinessScope {
	const url = new URL(`https://${scope.domain}`);
	if (
		!(scope.organizationId && scope.websiteId) ||
		url.username ||
		url.password ||
		url.port ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new Error("A complete website business scope is required");
	}
	let domain = url.hostname;
	if (domain.endsWith(".")) {
		domain = domain.slice(0, -1);
	}
	if (domain.startsWith("www.")) {
		domain = domain.slice(4);
	}
	return {
		organizationId: scope.organizationId,
		websiteId: scope.websiteId,
		domain,
		...(scope.startedAt === undefined
			? {}
			: {
					startedAt: new Date(
						z.iso.datetime({ offset: true }).parse(scope.startedAt)
					).toISOString(),
				}),
	};
}

export function businessContainerTag(input: BusinessScope): string {
	const scope = canonicalBusinessScope(input);
	const identity = [scope.organizationId, scope.websiteId, scope.domain];
	if (scope.startedAt !== undefined) {
		identity.push(scope.startedAt);
	}
	return `business_${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 40)}`;
}

export async function getWebsiteBusinessScope(
	input: { organizationId: string; websiteId: string },
	options: {
		initialize?: boolean;
		database?: Pick<typeof db, "select" | "update">;
	} = {}
): Promise<(BusinessScope & { startedAt: string }) | null> {
	const { and, db, eq, isNull, sql } = await import("@databuddy/db");
	const { websites } = await import("@databuddy/db/schema");
	const database = options.database ?? db;
	const ownership = and(
		eq(websites.id, input.websiteId),
		eq(websites.organizationId, input.organizationId),
		isNull(websites.deletedAt)
	);
	if (options.initialize) {
		await database
			.update(websites)
			.set({
				settings: sql`jsonb_set(coalesce(${websites.settings}, '{}'::jsonb), '{businessContextStartedAt}', to_jsonb(${new Date().toISOString()}::text), true)`,
				// Initializing memory does not edit the website itself.
				updatedAt: sql`${websites.updatedAt}`,
			})
			.where(
				and(
					ownership,
					sql`${websites.settings}->>'businessContextStartedAt' IS NULL`
				)
			);
	}
	const query = database
		.select({ domain: websites.domain, settings: websites.settings })
		.from(websites)
		.where(ownership)
		.limit(1);
	// With a supplied transaction, keep reply acceptance in this exact scope.
	const [site] = await (options.initialize ? query.for("update") : query);
	const started = z.iso
		.datetime({ offset: true })
		.safeParse(site?.settings?.businessContextStartedAt);
	if (!(site && started.success)) {
		return null;
	}
	return {
		...canonicalBusinessScope({ ...input, domain: site.domain }),
		startedAt: new Date(started.data).toISOString(),
	};
}

const retirementSchema = z.object({
	success: z.literal(true),
	deletedCount: z.number().int().nonnegative(),
	errors: z.array(z.unknown()).max(0).optional(),
	skippedProcessingCount: z.number().int().min(0).max(0).optional(),
});

export class BusinessMemoryRetirementError extends Error {
	constructor(cause: unknown) {
		super("Business memory could not be retired; retry the website operation", {
			cause,
		});
		this.name = "BusinessMemoryRetirementError";
	}
}

export async function retireBusinessMemory(
	scope: BusinessScope,
	options: { client?: Supermemory; abortSignal?: AbortSignal } = {}
): Promise<{ status: "retired" | "disabled" }> {
	const memory = options.client ?? getMemoryClient();
	if (!memory) {
		return { status: "disabled" };
	}
	try {
		const result = await memory.documents.deleteBulk(
			{ containerTags: [businessContainerTag(scope)] },
			{ timeout: 4000, maxRetries: 0, signal: options.abortSignal }
		);
		retirementSchema.parse(result);
	} catch (error) {
		throw new BusinessMemoryRetirementError(error);
	}
	return { status: "retired" };
}

export async function withBusinessMemoryWrite<T>(
	scope: BusinessScope,
	operation: () => Promise<T>,
	database?: Pick<typeof db, "transaction">
): Promise<T> {
	if (!scope.startedAt) {
		throw new Error("Business memory writes require an initialized scope");
	}
	const { and, db, eq, isNull, sql } = await import("@databuddy/db");
	const { websites } = await import("@databuddy/db/schema");
	return (database ?? db).transaction(async (tx) => {
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
		if (
			!site?.settings?.businessContextStartedAt ||
			businessContainerTag({
				...scope,
				domain: site.domain,
				startedAt: site.settings.businessContextStartedAt,
			}) !== businessContainerTag(scope)
		) {
			throw new Error("Business memory scope changed or was deleted");
		}
		// The caller's native request is bounded to four seconds. Fetch pages first.
		return await operation();
	});
}
