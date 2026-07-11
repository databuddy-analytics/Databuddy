import { describe, expect, it } from "bun:test";
import { getAttachDialogCopy } from "./attach-dialog-copy";

describe("getAttachDialogCopy", () => {
	it("names upgrades explicitly", () => {
		expect(getAttachDialogCopy("upgrade", "Pro")).toMatchObject({
			title: "Upgrade to Pro",
			confirmLabel: "Confirm upgrade",
		});
	});

	it("does not describe downgrades as purchases", () => {
		expect(getAttachDialogCopy("downgrade", "Hobby")).toMatchObject({
			title: "Downgrade to Hobby",
			confirmLabel: "Confirm downgrade",
		});
	});

	it("uses a recovery-specific label for canceled plans", () => {
		expect(getAttachDialogCopy("resume", "Pro").confirmLabel).toBe(
			"Resume plan"
		);
	});
});
