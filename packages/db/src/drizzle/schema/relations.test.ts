import { describe, expect, test } from "bun:test";
import { relations } from "./relations";

describe("insight observation relations", () => {
	test("registers the table and its owning relations", () => {
		expect(relations.insightObservations.relations).toEqual(
			expect.objectContaining({
				organization: expect.any(Object),
				run: expect.any(Object),
				website: expect.any(Object),
			})
		);
		expect(relations.organization.relations).toHaveProperty(
			"insightObservations"
		);
		expect(relations.websites.relations).toHaveProperty("insightObservations");
		expect(relations.insightRuns.relations).toHaveProperty("observations");
	});

	test("registers durable run effects under their run item", () => {
		expect(relations.insightRunEffects.relations).toHaveProperty("item");
		expect(relations.insightRunItems.relations).toHaveProperty("effects");
	});
});
