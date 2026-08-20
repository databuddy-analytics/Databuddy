import { describe, expect, test } from "bun:test";
import { getAuditOrganizationId, setAuditOrganization } from "../lib/audit";
import { isAuditedMutationPath } from "./audit-mutation";

describe("isAuditedMutationPath", () => {
	test("recognizes privileged mutation verbs across routers", () => {
		expect(isAuditedMutationPath("flags.create")).toBe(true);
		expect(isAuditedMutationPath("statusPage.createIncident")).toBe(true);
		expect(isAuditedMutationPath("organizations.updateEmailNotificationSettings")).toBe(true);
	});

	test("does not treat reads as mutations", () => {
		expect(isAuditedMutationPath("flags.list")).toBe(false);
		expect(isAuditedMutationPath("profiles.getHistory")).toBe(false);
	});

	test("leaves richer existing audit implementations in control", () => {
		expect(isAuditedMutationPath("apikeys.create")).toBe(false);
		expect(isAuditedMutationPath("websites.updateSettings")).toBe(false);
	});

	test("rejects malformed procedure paths", () => {
		expect(isAuditedMutationPath("create")).toBe(false);
		expect(isAuditedMutationPath("flags")).toBe(false);
	});
});

describe("audit organization targeting", () => {
	test("uses an explicitly resolved target organization", () => {
		const context = {
			auditOrganizationId: undefined,
			organizationId: "org-active",
		} as Parameters<typeof setAuditOrganization>[0];

		setAuditOrganization(context, "org-target");

		expect(getAuditOrganizationId(context)).toBe("org-target");
	});

	test("falls back to the active organization", () => {
		const context = {
			auditOrganizationId: undefined,
			organizationId: "org-active",
		} as Parameters<typeof setAuditOrganization>[0];

		expect(getAuditOrganizationId(context)).toBe("org-active");
	});
});
