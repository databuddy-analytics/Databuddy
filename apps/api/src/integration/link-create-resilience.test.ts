import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { appRouter } from "@databuddy/rpc";
import { db, sql } from "@databuddy/db";
import { resetLinkCacheFailFast, runLinkCacheCommand } from "@databuddy/redis";
import {
	reset,
	cleanup,
	hasTestDb,
	userContext,
	expectCode,
	insertOrganization,
	signUp,
	addToOrganization,
} from "@databuddy/test";
import { call } from "./helpers";

const iit = hasTestDb ? it : it.skip;

beforeEach(async () => {
	resetLinkCacheFailFast();
	await reset();
});
afterAll(async () => {
	resetLinkCacheFailFast();
	await cleanup();
});

async function memberSetup(role: "member" | "owner" = "member") {
	const user = await signUp();
	const org = await insertOrganization();
	await addToOrganization(user.id, org.id, role);
	return { user, org, context: userContext(user, org.id) };
}

function tripLinkCacheFailFast() {
	return runLinkCacheCommand(() =>
		Promise.reject(new Error("forced link cache failure"))
	).catch(() => undefined);
}

describe("links.create under link cache failure", () => {
	iit("creates with a generated slug while the cache is failing fast", async () => {
		const { org, context } = await memberSetup();
		await tripLinkCacheFailFast();

		const result = await call(appRouter.links.create, context)({
			name: "Cache Down",
			targetUrl: "https://example.com",
			organizationId: org.id,
		});

		expect(result.slug).toBeDefined();
		expect(result.organizationId).toBe(org.id);
	});

	iit("rejects a custom slug while the cache is failing fast", async () => {
		const { org, context } = await memberSetup();
		await tripLinkCacheFailFast();

		await expectCode(
			call(appRouter.links.create, context)({
				name: "Custom Down",
				targetUrl: "https://example.com",
				organizationId: org.id,
				slug: `down-${Date.now()}`,
			}),
			"SERVICE_UNAVAILABLE"
		);
	});
});

describe("link mutation round-trip budget", () => {
	iit("create, update, and delete run without transaction round-trips", async () => {
		const { org, context } = await memberSetup("owner");

		const warmup = await call(appRouter.links.create, context)({
			name: "Warmup",
			targetUrl: "https://example.com",
			organizationId: org.id,
		});

		const transactionSpy = vi.spyOn(db, "transaction");

		const created = await call(appRouter.links.create, context)({
			name: "Budget",
			targetUrl: "https://example.com",
			organizationId: org.id,
		});
		await call(appRouter.links.update, context)({
			id: created.id,
			name: "Budget Renamed",
		});
		await call(appRouter.links.delete, context)({ id: created.id });
		await call(appRouter.links.delete, context)({ id: warmup.id });

		expect(transactionSpy).not.toHaveBeenCalled();
		transactionSpy.mockRestore();
	});
});

describe("pool statement timeout", () => {
	iit("applies statement_timeout on every pooled connection", async () => {
		const result = await db.execute(sql`SHOW statement_timeout`);
		const rows = Array.isArray(result) ? result : result.rows;
		expect(rows[0]).toEqual({ statement_timeout: "30s" });
	});
});
