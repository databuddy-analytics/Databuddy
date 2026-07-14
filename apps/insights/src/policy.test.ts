import { describe, expect, it } from "bun:test";
import {
	INSIGHT_COOLDOWN_HOURS,
	INSIGHT_LOOKBACK_DAYS,
} from "./policy";

describe("insight policy", () => {
	it("keeps execution limits internal and fixed", () => {
			expect({
			cooldownHours: INSIGHT_COOLDOWN_HOURS,
			lookbackDays: INSIGHT_LOOKBACK_DAYS,
		}).toEqual({
			cooldownHours: 6,
			lookbackDays: 7,
		});
	});

});
