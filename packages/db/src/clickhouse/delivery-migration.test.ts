import { describe, expect, it } from "bun:test";
import { readSql } from "./schema-parse";

const RUNBOOK = readSql(
	`${import.meta.dir}/migrations/20260801_delivery_deduplication.md`
);

describe("delivery deduplication cutover", () => {
	it("globally canonicalizes every source identity before exchange", () => {
		expect(RUNBOOK.match(/^\s+LIMIT 1 BY/gm)).toHaveLength(6);
		expect(RUNBOOK.match(/WHERE empty\(delivery_id\)/g)).toHaveLength(3);
		expect(RUNBOOK).toMatch(
			/Do not split these\s+queries by event-time partition\./
		);
		expect(RUNBOOK.indexOf("LIMIT 1 BY")).toBeLessThan(
			RUNBOOK.indexOf("EXCHANGE TABLES")
		);
		expect(RUNBOOK).toContain(
			"complete `ORDER BY` key of each serving table is exactly its tenant plus\nstable row identity"
		);
		expect(RUNBOOK).toContain("HAVING mapped_times > 1");
		expect(RUNBOOK).toContain(
			"no stable identity spans more than one mapped analytics time or date"
		);
	});

	it("freezes every producer and queue before exchanging names", () => {
		for (const topic of [
			"analytics-events",
			"analytics-custom-events",
			"analytics-error-spans",
			"analytics-vitals-spans",
			"analytics-outgoing-links",
			"analytics-link-visits",
		]) {
			expect(RUNBOOK).toContain(topic);
		}

		const pauseAt = RUNBOOK.indexOf("## 5. Pause producers");
		const zeroLagAt = RUNBOOK.indexOf("consumer lag is zero", pauseAt);
		const stopVectorAt = RUNBOOK.indexOf("Stop Vector", zeroLagAt);
		const exchangeAt = RUNBOOK.indexOf("## 6. Exchange names");

		expect(pauseAt).toBeGreaterThan(-1);
		expect(zeroLagAt).toBeGreaterThan(pauseAt);
		expect(stopVectorAt).toBeGreaterThan(zeroLagAt);
		expect(exchangeAt).toBeGreaterThan(stopVectorAt);
	});
});
