import { randomUUIDv7 } from "bun";
import { and, db, eq, gte, inArray } from "@databuddy/db";
import { analyticsInsights } from "@databuddy/db/schema";
import dayjs from "dayjs";
import { emitInsightsEvent } from "./lib/evlog-insights";

const CHAIN_WINDOW_MINUTES = 60;
const MIN_WEBSITES_FOR_CHAIN = 2;

export interface ChainCandidate {
	chainId: string | null;
	createdAt: Date;
	id: string;
	sentiment: string;
	type: string;
	websiteId: string;
}

export interface ChainAssignment {
	chainId: string;
	insightIds: string[];
	sentiment: string;
	type: string;
	websiteIds: string[];
}

interface Bucket {
	existingChainIds: Set<string>;
	insightIds: string[];
	key: string;
	sentiment: string;
	type: string;
	websiteIds: Set<string>;
}

export function bucketCandidates(
	candidates: readonly ChainCandidate[]
): Bucket[] {
	const buckets = new Map<string, Bucket>();
	for (const c of candidates) {
		const key = `${c.type}::${c.sentiment}`;
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = {
				key,
				type: c.type,
				sentiment: c.sentiment,
				insightIds: [],
				websiteIds: new Set(),
				existingChainIds: new Set(),
			};
			buckets.set(key, bucket);
		}
		bucket.insightIds.push(c.id);
		bucket.websiteIds.add(c.websiteId);
		if (c.chainId) {
			bucket.existingChainIds.add(c.chainId);
		}
	}
	return [...buckets.values()];
}

export function planChainAssignments(
	candidates: readonly ChainCandidate[]
): ChainAssignment[] {
	const assignments: ChainAssignment[] = [];
	for (const bucket of bucketCandidates(candidates)) {
		if (bucket.websiteIds.size < MIN_WEBSITES_FOR_CHAIN) {
			continue;
		}
		const chainId =
			bucket.existingChainIds.size > 0
				? [...bucket.existingChainIds][0]
				: `chn_${randomUUIDv7()}`;
		assignments.push({
			chainId,
			insightIds: bucket.insightIds,
			websiteIds: [...bucket.websiteIds],
			type: bucket.type,
			sentiment: bucket.sentiment,
		});
	}
	return assignments;
}

export async function detectAndAssignChains(params: {
	organizationId: string;
	windowMinutes?: number;
}): Promise<ChainAssignment[]> {
	const windowMinutes = params.windowMinutes ?? CHAIN_WINDOW_MINUTES;
	const cutoff = dayjs().subtract(windowMinutes, "minute").toDate();

	const candidates: ChainCandidate[] = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			chainId: analyticsInsights.chainId,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, params.organizationId),
				gte(analyticsInsights.createdAt, cutoff)
			)
		);

	const assignments = planChainAssignments(candidates);
	if (assignments.length === 0) {
		return [];
	}

	await db.transaction(async (tx) => {
		for (const assignment of assignments) {
			await tx
				.update(analyticsInsights)
				.set({ chainId: assignment.chainId })
				.where(
					and(
						eq(analyticsInsights.organizationId, params.organizationId),
						inArray(analyticsInsights.id, assignment.insightIds)
					)
				);
		}
	});

	for (const assignment of assignments) {
		emitInsightsEvent("info", "chain.detected", {
			organization_id: params.organizationId,
			chain_id: assignment.chainId,
			type: assignment.type,
			sentiment: assignment.sentiment,
			website_count: assignment.websiteIds.length,
			insight_count: assignment.insightIds.length,
		});
	}

	return assignments;
}
