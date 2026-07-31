import { describe, expect, it } from "vitest";
import { LinkShortenerBuilders } from "./links";

describe("LinkShortenerBuilders", () => {
	it("counts immutable visit ids so replayed deliveries do not inflate analytics", () => {
		const clickBuilders = [
			LinkShortenerBuilders.link_total_clicks,
			LinkShortenerBuilders.link_clicks_by_day,
			LinkShortenerBuilders.link_top_referrers,
			LinkShortenerBuilders.link_top_countries,
			LinkShortenerBuilders.link_top_regions,
			LinkShortenerBuilders.link_top_cities,
			LinkShortenerBuilders.link_top_devices,
			LinkShortenerBuilders.link_top_browsers,
		];

		for (const builder of clickBuilders) {
			expect(builder?.fields.join(" ")).toContain("uniqExact(id)");
		}
	});
});
