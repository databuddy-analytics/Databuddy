import "@databuddy/test/env";

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { appRouter } from "@databuddy/rpc";
import { db } from "@databuddy/db";
import { githubIntegrations } from "@databuddy/db/schema";
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

beforeEach(() => reset());
afterAll(() => cleanup());

let installationCounter = 0;

async function insertGithubIntegration(organizationId: string) {
	installationCounter += 1;
	const id = crypto.randomUUID();
	await db.insert(githubIntegrations).values({
		id,
		organizationId,
		installationId: `${Date.now()}${installationCounter}`,
		accountLogin: "acme",
		accountType: "Organization",
		accountId: "1001",
		status: "active",
	});
	return id;
}

describe("integrations.list github", () => {
	iit("returns an empty github array without installations", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");

		const result = await call(
			appRouter.integrations.list,
			userContext(user, org.id),
		)({ organizationId: org.id });

		expect(result.github).toEqual([]);
	});

	iit("returns the organization's installations", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		const integrationId = await insertGithubIntegration(org.id);

		const result = await call(
			appRouter.integrations.list,
			userContext(user, org.id),
		)({ organizationId: org.id });

		expect(result.github).toHaveLength(1);
		expect(result.github[0].id).toBe(integrationId);
		expect(result.github[0].accountLogin).toBe("acme");
		expect(result.github[0].status).toBe("active");
	});

	iit("does not leak another organization's installations", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		const otherOrg = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");
		await insertGithubIntegration(otherOrg.id);

		const result = await call(
			appRouter.integrations.list,
			userContext(user, org.id),
		)({ organizationId: org.id });

		expect(result.github).toEqual([]);
	});
});

describe("integrations.uninstallGitHub", () => {
	iit("removes the installation for an owner", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "owner");
		const integrationId = await insertGithubIntegration(org.id);

		const result = await call(
			appRouter.integrations.uninstallGitHub,
			userContext(user, org.id),
		)({ organizationId: org.id, integrationId });

		expect(result.success).toBe(true);
		expect(result.githubUninstalled).toBe(false);

		const remaining = await call(
			appRouter.integrations.list,
			userContext(user, org.id),
		)({ organizationId: org.id });
		expect(remaining.github).toEqual([]);
	});

	iit("rejects viewers", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "viewer");
		const integrationId = await insertGithubIntegration(org.id);

		await expectCode(
			call(
				appRouter.integrations.uninstallGitHub,
				userContext(user, org.id),
			)({ organizationId: org.id, integrationId }),
			"FORBIDDEN",
		);
	});

	iit("cannot uninstall through another organization", async () => {
		const attacker = await signUp();
		const attackerOrg = await insertOrganization();
		const victimOrg = await insertOrganization();
		await addToOrganization(attacker.id, attackerOrg.id, "owner");
		const integrationId = await insertGithubIntegration(victimOrg.id);

		await expectCode(
			call(
				appRouter.integrations.uninstallGitHub,
				userContext(attacker, attackerOrg.id),
			)({ organizationId: attackerOrg.id, integrationId }),
			"NOT_FOUND",
		);
	});
});

describe("integrations.listGitHubRepos", () => {
	iit("requires a connection when none exists", async () => {
		const user = await signUp();
		const org = await insertOrganization();
		await addToOrganization(user.id, org.id, "member");

		await expectCode(
			call(
				appRouter.integrations.listGitHubRepos,
				userContext(user, org.id),
			)({ organizationId: org.id }),
			"BAD_REQUEST",
		);
	});
});
