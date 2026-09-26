import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const caseSchema = z.object({
	id: z.string(),
	path: z.string(),
	line: z.number().int().positive(),
	expectedDecision: z.enum(["useful", "covered", "ignore", "needs_context"]),
	split: z.enum(["known", "holdout"]),
	sourceSha: z.string().optional(),
});
const spanSchema = z.object({
	path: z.string(),
	start: z.number(),
	end: z.number(),
});
const dryRunSchema = z.object({
	payload: z.object({ segments: z.array(spanSchema) }),
});
const resultSchema = z.object({
	rows: z.array(
		spanSchema.extend({ coverage: z.string(), priority: z.number() })
	),
});

const shownPriority = 0.7;
const [resultsPath, ...flags] = process.argv.slice(2);
const verbose = flags.includes("--verbose") || resultsPath === "--verbose";
const here = dirname(fileURLToPath(import.meta.url));
const packageDir = join(here, "..");
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
	cwd: packageDir,
	encoding: "utf8",
}).trim();
const cases = z
	.array(caseSchema)
	.parse(JSON.parse(await readFile(join(here, "cases.json"), "utf8")));
const covers = (span: z.infer<typeof spanSchema>, path: string, line: number) =>
	span.path === path && span.start <= line && line <= span.end;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const current = await Promise.all(
	cases.map(async (item) => {
		const text = await readFile(join(root, item.path), "utf8").catch(
			() => null
		);
		return text !== null && (!item.sourceSha || sha(text) === item.sourceSha);
	})
);
const live = cases.filter((_, index) => current[index]);
const segments = dryRunSchema.parse(
	JSON.parse(
		execFileSync(
			"bun",
			[join(packageDir, "src/cli.ts"), "--dry-run", "--json", root],
			{
				encoding: "utf8",
				maxBuffer: 256 * 1024 * 1024,
			}
		)
	)
).payload.segments;
const rows = resultsPath?.endsWith(".json")
	? resultSchema.parse(JSON.parse(await readFile(resultsPath, "utf8"))).rows
	: null;

const percent = (hit: number, total: number) =>
	total ? `${Math.round((hit / total) * 100)}% (${hit}/${total})` : "n/a";
console.log(
	`${cases.length} cases, ${live.length} current, ${cases.length - live.length} stale (file changed since labelling)`
);
for (const split of ["known", "holdout"] as const) {
	const scoped = live.filter((item) => item.split === split);
	if (!scoped.length) {
		continue;
	}
	const extracted = (item: (typeof scoped)[number]) =>
		segments.some((segment) => covers(segment, item.path, item.line));
	const useful = scoped.filter((item) => item.expectedDecision === "useful");
	const ignored = scoped.filter((item) => item.expectedDecision === "ignore");
	const misses = useful.filter((item) => !extracted(item));
	console.log(`\n${split} (${scoped.length})`);
	console.log(
		`  extraction recall   ${percent(useful.length - misses.length, useful.length)}`
	);
	console.log(
		`  ignore suppressed   ${percent(ignored.filter((item) => !extracted(item)).length, ignored.length)}`
	);
	if (verbose) {
		for (const item of misses) {
			console.log(`    not extracted: ${item.id} ${item.path}:${item.line}`);
		}
	}
	if (!rows) {
		continue;
	}
	const flagged = (item: (typeof scoped)[number]) =>
		rows.some(
			(row) =>
				covers(row, item.path, item.line) &&
				(row.coverage === "missing" || row.coverage === "partial") &&
				row.priority >= shownPriority
		);
	const hits = scoped.filter(flagged);
	const truePositives = hits.filter(
		(item) => item.expectedDecision === "useful"
	);
	console.log(
		`  findings precision  ${percent(truePositives.length, hits.length)}`
	);
	console.log(
		`  findings recall     ${percent(truePositives.length, useful.length)}`
	);
	if (verbose) {
		for (const item of hits.filter(
			(hit) => hit.expectedDecision !== "useful"
		)) {
			console.log(`    false finding: ${item.id} (${item.expectedDecision})`);
		}
		for (const item of useful.filter((hit) => !flagged(hit))) {
			console.log(`    missed finding: ${item.id}`);
		}
	}
}
if (!rows) {
	console.log(
		"\nPass a scan result to score findings: bun ./scan.ts --json > /tmp/scan.json, then bun quality/run.ts /tmp/scan.json"
	);
}
