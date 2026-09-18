import { describe, expect, it } from "bun:test";
import type { DatabuddyAgentToolTrace } from "@databuddy/ai/agent";
import { queryEvidenceBlocks } from "./query-evidence";

const summary =
	"summary_metrics | 2026-09-01 to 2026-09-07 | timezone=UTC | filters=none | groupBy=default | timeUnit=default | orderBy=default | limit=default";
const result = { summary, returnedRows: 1, rowCount: 1, truncated: false };
const website = { id: "site-synthetic", domain: "reports.example.com" };

function trace(
	output: DatabuddyAgentToolTrace["output"]
): DatabuddyAgentToolTrace {
	return { index: 0, name: "get_data", input: {}, output };
}

describe("Slack query evidence", () => {
	it("preserves comparison windows and separates verified websites", () => {
		const prior = summary
			.replaceAll("2026-09-01", "2026-08-25")
			.replaceAll("2026-09-07", "2026-08-31");
		const blocks = queryEvidenceBlocks([
			trace({
				batch: true,
				website,
				results: [result, { ...result, summary: prior }],
			}),
			trace({
				batch: true,
				website: { id: "site/other?scope=x", domain: "other.example.com" },
				results: [
					{ ...result, returnedRows: 20, rowCount: 54, truncated: true },
				],
			}),
		]);
		expect(blocks).toHaveLength(4);
		expect(blocks.at(1)).toMatchObject({
			type: "section",
			text: {
				type: "plain_text",
				text: `${website.domain}\n${summary}\n1 result row.`,
			},
			accessory: { url: "https://app.databuddy.cc/websites/site-synthetic" },
		});
		expect(JSON.stringify(blocks.at(2))).toContain(prior);
		expect(blocks.at(3)).toMatchObject({
			text: {
				type: "plain_text",
				text: `other.example.com\n${summary}\nPartial query result: 20 of 54 rows.`,
			},
			accessory: {
				text: { text: "Open website" },
				url: "https://app.databuddy.cc/websites/site%2Fother%3Fscope%3Dx",
			},
		});
	});

	it.each([
		null,
		{},
		{ batch: true, results: [result] },
		{ batch: true, website: { ...website, id: "\ud800" }, results: [result] },
		{
			batch: true,
			website,
			results: [null, { ...result, error: "query failed" }],
		},
		{ batch: true, website, results: [{ ...result, summary: "" }] },
		{ batch: true, website, results: [{ ...result, rowCount: -1 }] },
		{ batch: true, website, results: [{ ...result, returnedRows: 0.5 }] },
		{ batch: true, website, results: [{ ...result, rowCount: 2 }] },
	])("ignores malformed or failed evidence: %j", (output) => {
		expect(queryEvidenceBlocks([trace(output)])).toEqual([]);
	});

	it("includes successful empty results but never failed or unsupported reads", () => {
		const output = {
			batch: true,
			website,
			results: [
				{ ...result, error: "Unavailable" },
				{ ...result, returnedRows: 0, rowCount: 0 },
			],
		};
		const blocks = queryEvidenceBlocks([
			{ ...trace(output), name: "execute_sql_query" },
			trace(output),
		]);
		expect(blocks).toHaveLength(2);
		expect(JSON.stringify(blocks)).toContain("0 result rows.");
		expect(JSON.stringify(blocks)).not.toContain("Unavailable");
	});

	it("omits entire long receipts and counts entries beyond the three-receipt limit", () => {
		const long = `${summary} | filters=${"synthetic-filter".repeat(100)}`;
		const blocks = queryEvidenceBlocks([
			trace({
				batch: true,
				website,
				results: [{ ...result, summary: long }, result, result, result, result],
			}),
		]);
		expect(blocks).toHaveLength(5);
		expect(JSON.stringify(blocks)).not.toContain("synthetic-filter");
		expect(JSON.stringify(blocks)).toContain(
			"2 additional query receipts omitted"
		);
	});

	it("keeps filter text literal and ignores supplied source URLs", () => {
		const blocks = queryEvidenceBlocks([
			trace({
				batch: true,
				website: { ...website, url: "https://untrusted.example.com" },
				results: [{ ...result, summary: `${summary} <@U_SYNTHETIC> <!here>` }],
			}),
		]);
		expect(blocks.at(1)).toMatchObject({
			text: {
				type: "plain_text",
				text: `${website.domain}\n${summary} <@U_SYNTHETIC> <!here>\n1 result row.`,
			},
		});
		expect(JSON.stringify(blocks)).not.toContain("untrusted.example.com");
	});

	it("keeps a complete 1000-character receipt and omits a larger entry intact", () => {
		const boundary = "x".repeat(
			1000 - `${website.domain}\n\n1 result row.`.length
		);
		const blocks = queryEvidenceBlocks([
			trace({
				batch: true,
				website,
				results: [
					{ ...result, summary: boundary },
					{ ...result, summary: `${boundary}y` },
				],
			}),
		]);
		expect(blocks).toHaveLength(3);
		expect(blocks.at(1)).toMatchObject({
			text: { text: `${website.domain}\n${boundary}\n1 result row.` },
		});
		expect(JSON.stringify(blocks)).not.toContain(`${boundary}y`);
		expect(JSON.stringify(blocks.at(2))).toContain(
			"1 additional query receipt omitted"
		);
	});
});
