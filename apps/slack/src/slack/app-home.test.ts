import { describe, expect, it } from "bun:test";
import { buildAppHomeView } from "@/slack/app-home";

describe("buildAppHomeView", () => {
	it("includes quick-action buttons that deep-link into the dashboard", () => {
		const view = buildAppHomeView();
		const blocks = view.blocks as Array<Record<string, unknown>>;
		const actions = blocks.find((b) => b.type === "actions");
		expect(actions).toBeDefined();
		const buttons = actions?.elements as Array<{ url: string }>;
		expect(buttons.length).toBeGreaterThan(0);
			const dashboardOrigin = new URL("https://app.databuddy.cc").origin;
			expect(buttons.every((button) => new URL(button.url).origin === dashboardOrigin)).toBe(
				true
			);
	});

	it("renders connected sites when provided, and omits the block when empty", () => {
		const withSites = buildAppHomeView([
			{ domain: "app.databuddy.cc", name: "Dashboard" },
			{ domain: "databuddy.cc", name: null },
		]);
		const text = JSON.stringify(withSites);
		expect(text).toContain("Your connected sites");
		expect(text).toContain("*Dashboard* — app.databuddy.cc");
		expect(text).toContain("• databuddy.cc");

		expect(JSON.stringify(buildAppHomeView([]))).not.toContain(
			"Your connected sites"
		);
	});
});
