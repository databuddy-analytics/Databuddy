import type { DatabuddyAgentToolTrace } from "@databuddy/ai/agent";
import type { KnownBlock } from "@slack/web-api";
import { isRecord } from "@/lib/guards";

const MAX_RECEIPTS = 3;
const MAX_RECEIPT_LENGTH = 1000;
const UNPAIRED_SURROGATE = /[\uD800-\uDFFF]/u;

export function queryEvidenceBlocks(
	trace: readonly DatabuddyAgentToolTrace[]
): KnownBlock[] {
	const blocks: KnownBlock[] = [];
	let omitted = 0;
	for (const call of trace) {
		if (call.name !== "get_data" || !isRecord(call.output)) {
			continue;
		}
		const { results, website } = call.output;
		if (
			call.output.batch !== true ||
			!Array.isArray(results) ||
			!isRecord(website) ||
			typeof website.id !== "string" ||
			!website.id.trim() ||
			website.id.length > 256 ||
			UNPAIRED_SURROGATE.test(website.id) ||
			typeof website.domain !== "string" ||
			!website.domain.trim()
		) {
			continue;
		}
		for (const result of results) {
			if (
				!isRecord(result) ||
				result.error !== undefined ||
				typeof result.summary !== "string" ||
				!result.summary.trim() ||
				typeof result.returnedRows !== "number" ||
				!Number.isSafeInteger(result.returnedRows) ||
				result.returnedRows < 0 ||
				typeof result.rowCount !== "number" ||
				!Number.isSafeInteger(result.rowCount) ||
				result.rowCount < result.returnedRows ||
				result.truncated !== result.returnedRows < result.rowCount
			) {
				continue;
			}
			const rows = result.truncated
				? `Partial query result: ${result.returnedRows} of ${result.rowCount} rows.`
				: `${result.rowCount} result ${result.rowCount === 1 ? "row" : "rows"}.`;
			const text = `${website.domain}\n${result.summary}\n${rows}`;
			if (blocks.length === MAX_RECEIPTS || text.length > MAX_RECEIPT_LENGTH) {
				omitted++;
				continue;
			}
			blocks.push({
				type: "section",
				text: { type: "plain_text", text, emoji: false },
				accessory: {
					type: "button",
					text: { type: "plain_text", text: "Open website" },
					url: `https://app.databuddy.cc/websites/${encodeURIComponent(website.id)}`,
				},
			});
		}
	}
	if (!(blocks.length || omitted)) {
		return [];
	}
	blocks.unshift({
		type: "section",
		text: { type: "plain_text", text: "Data checked" },
	});
	if (omitted) {
		blocks.push({
			type: "context",
			elements: [
				{
					type: "plain_text",
					text: `${omitted} additional query ${omitted === 1 ? "receipt" : "receipts"} omitted to keep this message short.`,
				},
			],
		});
	}
	return blocks;
}
