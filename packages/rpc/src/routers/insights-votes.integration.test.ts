import { afterAll, afterEach, describe, expect, it } from "bun:test";
import type { Context } from "../orpc";

const localDatabaseUrl =
	"postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy_test";
const localRedisUrl = "redis://localhost:6379/1";

if (process.env.CI !== "true") {
	process.env.DATABASE_URL = localDatabaseUrl;
	process.env.REDIS_URL = localRedisUrl;
	process.env.BULLMQ_REDIS_URL = localRedisUrl;
}
process.env.BETTER_AUTH_SECRET ??= "test-auth-secret-for-integration";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.NODE_ENV = "test";

const { and, db, eq, inArray, shutdownPostgres, sql } = await import(
	"@databuddy/db"
);
const {
	analyticsInsights,
	insightGenerationConfigs,
	insightUserFeedback,
	member,
	organization,
	user,
	websites,
} = await import("@databuddy/db/schema");
const { auth } = await import("@databuddy/auth");
const { shutdownRedis } = await import("@databuddy/redis/redis");
const { insightGenerationRouter } = await import("./insight-generation");
const { insightsRouter } = await import("./insights");

const handler = {
	getById: insightsRouter.getById["~orpc"].handler,
	getVotes: insightsRouter.getVotes["~orpc"].handler,
	setVote: insightsRouter.setVote["~orpc"].handler,
};
const generationHandler = {
	getConfig: insightGenerationRouter.getConfig["~orpc"].handler,
	upsertConfig: insightGenerationRouter.upsertConfig["~orpc"].handler,
};
const runIntegrationTests =
	process.env.CI === "true" ||
	process.env.INSIGHTS_INTEGRATION_TESTS === "true";
if (runIntegrationTests) {
	await db.execute(sql`select 1`);
}
const iit = runIntegrationTests ? it : it.skip;
const organizationIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
	if (organizationIds.length > 0) {
		await db
			.delete(organization)
			.where(inArray(organization.id, organizationIds.splice(0)));
	}
	if (userIds.length > 0) {
		await db.delete(user).where(inArray(user.id, userIds.splice(0)));
	}
});

afterAll(async () => {
	await Promise.all([shutdownPostgres(), shutdownRedis()]);
});

function nextId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}

async function insertUser() {
	const id = nextId("user");
	const now = new Date();
	const [row] = await db
		.insert(user)
		.values({
			id,
			name: "Insight reviewer",
			email: `${id}@example.com`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	userIds.push(id);
	return row;
}

async function insertOrganization() {
	const id = nextId("org");
	const [row] = await db
		.insert(organization)
		.values({
			id,
			name: `Organization ${id}`,
			slug: id,
			createdAt: new Date(),
		})
		.returning();
	organizationIds.push(id);
	return row;
}

async function addMember(
	userId: string,
	organizationId: string,
	role: "member" | "owner" = "member"
) {
	await db.insert(member).values({
		id: nextId("member"),
		userId,
		organizationId,
		role,
		createdAt: new Date(),
	});
}

async function insertWebsite(organizationId: string) {
	const id = nextId("website");
	const [row] = await db
		.insert(websites)
		.values({
			id,
			organizationId,
			domain: `${id}.example.com`,
			name: "Checkout",
		})
		.returning();
	return row;
}

async function insertInsight(input: {
	id: string;
	organizationId: string;
	websiteId: string;
}) {
	await db.insert(analyticsInsights).values({
		id: input.id,
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		runId: `run-${input.id}`,
		title: "Checkout completion fell",
		description: "Fewer visitors completed checkout.",
		suggestion: "Inspect the checkout flow.",
		severity: "warning",
		sentiment: "negative",
		type: "funnel_regression",
		priority: 8,
		subjectKey: "funnel:checkout",
		sources: ["product"],
		confidence: 0.9,
		currentPeriodFrom: "2026-07-01",
		currentPeriodTo: "2026-07-07",
		previousPeriodFrom: "2026-06-24",
		previousPeriodTo: "2026-06-30",
	});
}

function context(userId: string, email: string, organizationId: string): Context {
	const now = new Date();
	return {
		db,
		auth,
		user: {
			id: userId,
			name: "Insight reviewer",
			email,
			emailVerified: true,
			image: null,
			firstName: null,
			lastName: null,
			status: "ACTIVE",
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			role: "USER",
			twoFactorEnabled: false,
		},
		session: {
			id: nextId("session"),
			expiresAt: new Date(now.getTime() + 86_400_000),
			token: nextId("token"),
			createdAt: now,
			updatedAt: now,
			ipAddress: "127.0.0.1",
			userAgent: "test",
			userId,
			activeOrganizationId: organizationId,
		},
		apiKey: undefined,
		getBilling: async () => undefined,
		organizationId,
		headers: new Headers(),
		anonymousId: null,
		sessionId: null,
	};
}

async function expectCode(promise: Promise<unknown>, code: string) {
	await expect(promise).rejects.toMatchObject({ code });
}

describe("insight feedback tenancy", () => {
	iit("reads and writes a deep-linked finding in its stored organization", async () => {
		const storedUser = await insertUser();
		const activeOrg = await insertOrganization();
		const insightOrg = await insertOrganization();
		await addMember(storedUser.id, activeOrg.id);
		await addMember(storedUser.id, insightOrg.id);
		const website = await insertWebsite(insightOrg.id);
		const insightId = nextId("insight-org-b");
		await insertInsight({
			id: insightId,
			organizationId: insightOrg.id,
			websiteId: website.id,
		});

		await db.insert(insightUserFeedback).values({
			id: nextId("legacy-wrong-org-vote"),
			userId: storedUser.id,
			organizationId: activeOrg.id,
			insightId,
			vote: "up",
		});

		const activeContext = context(
			storedUser.id,
			storedUser.email,
			activeOrg.id
		);
		expect(
			(
				await handler.getById({
					context: activeContext,
					input: { insightId },
				})
			).insight?.id
		).toBe(insightId);
		expect(
			await handler.getVotes({
				context: activeContext,
				input: { insightIds: [insightId] },
			})
		).toEqual({ votes: {} });

		await handler.setVote({
			context: activeContext,
			input: { insightId, vote: "down" },
		});

		const rows = await db
			.select({
				organizationId: insightUserFeedback.organizationId,
				vote: insightUserFeedback.vote,
			})
			.from(insightUserFeedback)
			.where(
				and(
					eq(insightUserFeedback.userId, storedUser.id),
					eq(insightUserFeedback.insightId, insightId)
				)
			);

		expect(rows).toEqual([
			{ organizationId: insightOrg.id, vote: "down" },
		]);
		expect(
			await handler.getVotes({
				context: activeContext,
				input: { insightIds: [insightId] },
			})
		).toEqual({ votes: { [insightId]: "down" } });

		await handler.setVote({
			context: activeContext,
			input: { insightId, vote: null },
		});
		expect(
			await db
				.select({ id: insightUserFeedback.id })
				.from(insightUserFeedback)
				.where(eq(insightUserFeedback.insightId, insightId))
		).toEqual([]);
	});

	iit("does not expose or mutate votes for an inaccessible organization", async () => {
		const storedUser = await insertUser();
		const activeOrg = await insertOrganization();
		const inaccessibleOrg = await insertOrganization();
		await addMember(storedUser.id, activeOrg.id);
		const website = await insertWebsite(inaccessibleOrg.id);
		const insightId = nextId("insight-inaccessible");
		await insertInsight({
			id: insightId,
			organizationId: inaccessibleOrg.id,
			websiteId: website.id,
		});
		const activeContext = context(
			storedUser.id,
			storedUser.email,
			activeOrg.id
		);

		expect(
			await handler.getVotes({
				context: activeContext,
				input: { insightIds: [insightId] },
			})
		).toEqual({ votes: {} });
		await expectCode(
			handler.setVote({
				context: activeContext,
				input: { insightId, vote: "up" },
			}),
			"FORBIDDEN"
		);
	});
});

describe("insight generation compatibility authorization", () => {
	iit("requires organization update permission for a legacy website-scoped write", async () => {
		const storedUser = await insertUser();
		const storedOrganization = await insertOrganization();
		await addMember(storedUser.id, storedOrganization.id);
		const website = await insertWebsite(storedOrganization.id);
		const activeContext = context(
			storedUser.id,
			storedUser.email,
			storedOrganization.id
		);

		expect(
			await generationHandler.getConfig({
				context: activeContext,
				input: { websiteId: website.id },
			})
		).toMatchObject({
			organizationId: storedOrganization.id,
			source: "default",
			websiteId: website.id,
		});
		await expectCode(
			generationHandler.upsertConfig({
				context: activeContext,
				input: { enabled: true, websiteId: website.id },
			}),
			"FORBIDDEN"
		);
		expect(
			await db
				.select({ id: insightGenerationConfigs.id })
				.from(insightGenerationConfigs)
				.where(
					eq(
						insightGenerationConfigs.organizationId,
						storedOrganization.id
					)
				)
		).toEqual([]);
	});

	iit("rejects website-scoped mutations after authorizing an organization owner", async () => {
		const storedUser = await insertUser();
		const storedOrganization = await insertOrganization();
		await addMember(storedUser.id, storedOrganization.id, "owner");
		const website = await insertWebsite(storedOrganization.id);

		await expect(
			generationHandler.upsertConfig({
				context: context(
					storedUser.id,
					storedUser.email,
					storedOrganization.id
				),
				input: { enabled: true, websiteId: website.id },
			})
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining(
				"Website-specific insight settings are retired"
			),
		});
	});

	iit("accepts and ignores retired config values from old clients", async () => {
		const storedUser = await insertUser();
		const storedOrganization = await insertOrganization();
		await addMember(storedUser.id, storedOrganization.id, "owner");
		const website = await insertWebsite(storedOrganization.id);
		const activeContext = context(
			storedUser.id,
			storedUser.email,
			storedOrganization.id
		);
		const legacyPayload = {
			allowedTools: ["web_metrics", "business_context"] as const,
			cooldownHours: 48,
			cron: "0 3 * * 1",
			depth: "deep" as const,
			enabled: true,
			frequency: "custom" as const,
			lookbackDays: 30,
			maxInsightsPerWebsite: 2,
			maxSteps: 50,
			maxToolCalls: 50,
			modelTier: "deep" as const,
			organizationId: storedOrganization.id,
			timezone: "Europe/Berlin",
		};

		expect(
			await generationHandler.upsertConfig({
				context: activeContext,
				input: legacyPayload,
			})
		).toMatchObject({
			enabled: true,
			frequency: "weekly",
			timezone: "Europe/Berlin",
		});
		expect(
			await generationHandler.getConfig({
				context: activeContext,
				input: { websiteId: website.id },
			})
		).toMatchObject({
			source: "organization",
			websiteId: website.id,
		});
		expect(
			await generationHandler.upsertConfig({
				context: activeContext,
				input: {
					...legacyPayload,
					frequency: "hourly",
					maxSteps: 25,
					timezone: "America/New_York",
				},
			})
		).toMatchObject({
			frequency: "weekly",
			maxSteps: 24,
			timezone: "America/New_York",
		});

		const [stored] = await db
			.select()
			.from(insightGenerationConfigs)
			.where(eq(insightGenerationConfigs.organizationId, storedOrganization.id));
		expect(stored).toMatchObject({
			deliveries: [],
			enabled: true,
			frequency: "weekly",
			legacyModelTier: "balanced",
			organizationId: storedOrganization.id,
			timezone: "America/New_York",
		});
		for (const retiredField of [
			"allowedTools",
			"cooldownHours",
			"cron",
			"depth",
			"lookbackDays",
			"maxInsightsPerWebsite",
			"maxSteps",
			"maxToolCalls",
		]) {
			expect(stored).not.toHaveProperty(retiredField);
		}
	});
});
