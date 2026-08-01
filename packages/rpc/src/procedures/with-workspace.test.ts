import { describe, expect, expectTypeOf, it, mock } from "bun:test";
import type { Context } from "../orpc";
import type {
	PublicWorkspace,
	PublicWorkspaceWithPlan,
} from "./with-workspace";

process.env.REDIS_URL ??= "redis://localhost:6379";

const { createInternalPrincipal } = await import("../orpc");
const { requireLinkAccess } = await import("../routers/link-access");
const { withWorkspace } = await import("./with-workspace");

const ORGANIZATION_ID = "org-test";

function apiKeyContext(getBilling: Context["getBilling"]): Context {
	const principal = createInternalPrincipal({
		organizationId: ORGANIZATION_ID,
		scopes: ["write:links"],
	});

	return {
		...principal,
		organizationId: ORGANIZATION_ID,
		getBilling,
		user: undefined,
	} as Context;
}

describe("withWorkspace plan resolution", () => {
	it("keeps plan-free and plan-aware public results distinct", () => {
		expectTypeOf<PublicWorkspace>().not.toHaveProperty("plan");
		expectTypeOf<PublicWorkspaceWithPlan>().toHaveProperty("plan");
	});

	it("does not resolve billing for plan-free link access", async () => {
		const getBilling = mock(async () => ({
			canUserUpgrade: true,
			customerId: "user-test",
			isOrganization: true,
			planId: "pro",
		}));

		const workspace = await requireLinkAccess(
			apiKeyContext(getBilling),
			ORGANIZATION_ID,
			"create"
		);

		expect(getBilling).not.toHaveBeenCalled();
		expect("plan" in workspace).toBe(false);
	});

	it("requiredPlans forces real plan resolution defensively", async () => {
		const getBilling = mock(async () => ({
			canUserUpgrade: true,
			customerId: "user-test",
			isOrganization: true,
			planId: "pro",
		}));

		const workspace = await withWorkspace(apiKeyContext(getBilling), {
			organizationId: ORGANIZATION_ID,
			resource: "link",
			permissions: ["create"],
			includePlan: false,
			requiredPlans: ["pro"],
		});

		expect(getBilling).toHaveBeenCalledTimes(1);
		expect(workspace.plan).toBe("pro");
	});

	it("preserves the free fallback for explicit plan consumers", async () => {
		const getBilling = mock(async () => undefined);

		const workspace = await withWorkspace(apiKeyContext(getBilling), {
			organizationId: ORGANIZATION_ID,
			resource: "link",
			permissions: ["create"],
			includePlan: true,
		});

		expect(getBilling).toHaveBeenCalledTimes(1);
		expect(workspace.plan).toBe("free");
	});
});
