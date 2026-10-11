import "@databuddy/test/env";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { appRouter } from "@databuddy/rpc";
import { readImportFile } from "@databuddy/shared/import";
import {
	batchImportRecords,
	type ImportRecord,
	MAX_BATCH_PAGEVIEWS,
} from "@databuddy/shared/import/records";
import {
	addToOrganization,
	cleanup,
	expectCode,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
	userContext,
} from "@databuddy/test";
import JSZip from "jszip";
import { call } from "./helpers";

const iit = hasTestDb ? it : it.skip;

const PLAUSIBLE_EXPORT = {
	"imported_visitors_20260304_20260305.csv":
		"date,visitors,pageviews,bounces,visits,visit_duration\n2026-03-04,10,20,5,10,100\n2026-03-05,4,6,2,4,40\n",
	"imported_pages_20260304_20260305.csv":
		"date,hostname,page,visits,visitors,pageviews\n2026-03-04,example.com,/,10,10,20\n2026-03-05,example.com,/pricing,4,4,6\n",
	"imported_sources_20260304_20260305.csv":
		"date,source,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,pageviews,visitors,visits,visit_duration,bounces\n2026-03-04,Google,google.com,,,,,,8,4,4,40,2\n2026-03-05,dubai,,dubai,social,,,,3,2,2,10,1\n",
};

const DASHBOARD_DOWNLOAD = {
	"visitors.csv":
		"date,visitors,pageviews,visits,views_per_visit,bounce_rate,visit_duration\n2026-03-04 09:00:00,2,4,2,2.0,50,40\n2026-03-04 13:00:00,3,3,3,1.0,100,0\n2026-03-04 18:00:00,1,2,1,2.0,0,60\n",
	"pages.csv":
		"name,visitors,pageviews,bounce_rate,time_on_page,scroll_depth\n/,4,6,50,20,40\n/pricing,2,3,0,30,60\n",
	"countries.csv": "name,visitors\nGermany,4\nFrance,1\n",
	"devices.csv": "name,visitors\nDesktop,4\nMobile,1\n",
};

const websiteIds: string[] = [];

async function setup() {
	const user = await signUp();
	const org = await insertOrganization();
	await addToOrganization(user.id, org.id, "admin");
	const website = await insertWebsite({
		id: `import-${crypto.randomUUID()}`,
		organizationId: org.id,
		domain: "example.com",
	});
	websiteIds.push(website.id);
	const ctx = userContext(user, org.id);
	return {
		websiteId: website.id,
		ingest: call(appRouter.imports.ingest, ctx),
		finish: call(appRouter.imports.finish, ctx),
	};
}

async function plausibleRecords(
	websiteId: string,
	runId: string,
	entries: Record<string, string> = PLAUSIBLE_EXPORT
) {
	const zip = new JSZip();
	for (const [name, contents] of Object.entries(entries)) {
		zip.file(name, contents);
	}
	const { records } = await readImportFile(
		new File([await zip.generateAsync({ type: "uint8array" })], "export.zip"),
		{ domain: "example.com", runId, timezone: "UTC", websiteId }
	);
	return records;
}

async function importAll(
	client: Awaited<ReturnType<typeof setup>>,
	replaceExisting: boolean,
	entries: Record<string, string> = PLAUSIBLE_EXPORT
) {
	const runId = crypto.randomUUID();
	let rows = 0;
	for (const records of batchImportRecords(
		await plausibleRecords(client.websiteId, runId, entries)
	)) {
		const result = await client.ingest({
			websiteId: client.websiteId,
			providerId: "plausible",
			runId,
			timezone: "UTC",
			records,
		});
		rows += result.rows;
	}
	await client.finish({
		websiteId: client.websiteId,
		providerId: "plausible",
		runId,
		replaceExisting,
		rows,
	});
	return rows;
}

async function storedRows(websiteId: string) {
	const result = await clickHouse.query({
		query: `SELECT count() AS rows FROM ${TABLE_NAMES.events} WHERE client_id = {websiteId:String}`,
		query_params: { websiteId },
		format: "JSONEachRow",
	});
	const [row] = await result.json<{ rows: string }>();
	return Number(row?.rows ?? 0);
}

beforeAll(() =>
	clickHouse.command({
		query: `ALTER TABLE ${TABLE_NAMES.events} MODIFY SETTING non_replicated_deduplication_window = 100`,
	})
);
beforeEach(() => reset());
afterAll(async () => {
	await clickHouse.command({
		query: `ALTER TABLE ${TABLE_NAMES.events} RESET SETTING non_replicated_deduplication_window`,
	});
	if (websiteIds.length > 0) {
		await clickHouse.command({
			query: `ALTER TABLE ${TABLE_NAMES.events} DELETE WHERE client_id IN {websiteIds:Array(String)}`,
			query_params: { websiteIds },
			clickhouse_settings: { mutations_sync: "1" },
		});
	}
	await cleanup();
});

describe("imports.ingest", () => {
	iit("writes every row of a parsed export", async () => {
		const client = await setup();

		const rows = await importAll(client, false);

		expect(rows).toBeGreaterThan(0);
		expect(await storedRows(client.websiteId)).toBe(rows);
	});

	iit(
		"stores Plausible referrers and UTM tags where the referrer reports read them",
		async () => {
			const client = await setup();

			await importAll(client, false);

			const result = await clickHouse.query({
				query: `SELECT groupUniqArrayIf(domain(referrer), referrer != '') AS referrers, groupUniqArrayIf(utm_source, utm_source != '') AS utmSources FROM ${TABLE_NAMES.events} WHERE client_id = {websiteId:String} AND event_name = 'screen_view'`,
				query_params: { websiteId: client.websiteId },
				format: "JSONEachRow",
			});
			const [stored] = await result.json<{
				referrers: string[];
				utmSources: string[];
			}>();
			expect(stored?.referrers).toEqual(["google.com"]);
			expect(stored?.utmSources).toEqual(["dubai"]);
		}
	);

	iit(
		"imports a single day Plausible dashboard download as that day's traffic",
		async () => {
			const client = await setup();

			await importAll(client, false, DASHBOARD_DOWNLOAD);

			const result = await clickHouse.query({
				query: `SELECT count() AS pageviews, uniq(anonymous_id) AS visitors, groupUniqArray(country) AS countries, groupUniqArray(toDate(time)) AS days FROM ${TABLE_NAMES.events} WHERE client_id = {websiteId:String} AND event_name = 'screen_view'`,
				query_params: { websiteId: client.websiteId },
				format: "JSONEachRow",
			});
			const [stored] = await result.json<{
				countries: string[];
				days: string[];
				pageviews: string;
				visitors: string;
			}>();
			expect(Number(stored?.pageviews)).toBe(9);
			expect(Number(stored?.visitors)).toBe(5);
			expect(stored?.countries.toSorted()).toEqual(["France", "Germany"]);
			expect(stored?.days).toEqual(["2026-03-04"]);
		}
	);

	iit(
		"replaces the previous import only once the new one finishes",
		async () => {
			const client = await setup();
			const first = await importAll(client, false);

			const second = await importAll(client, true);

			expect(second).toBe(first);
			expect(await storedRows(client.websiteId)).toBe(second);
		}
	);

	iit(
		"rejects a batch bigger than one import can hold, with a readable reason",
		async () => {
			const client = await setup();
			const records: ImportRecord[] = [
				{
					grain: "rollup",
					date: "2026-03-04",
					dimension: { kind: "page", value: "/" },
					metrics: { pageviews: MAX_BATCH_PAGEVIEWS + 1 },
				},
			];

			const attempt = client.ingest({
				websiteId: client.websiteId,
				providerId: "plausible",
				runId: crypto.randomUUID(),
				timezone: "UTC",
				records,
			});

			await expect(attempt).rejects.toThrow(
				/more than the 100,000 one batch can hold/
			);
			expect(await storedRows(client.websiteId)).toBe(0);
		}
	);

	iit("rejects daily totals dated outside the importable range", async () => {
		const client = await setup();

		await expectCode(
			client.ingest({
				websiteId: client.websiteId,
				providerId: "plausible",
				runId: crypto.randomUUID(),
				timezone: "UTC",
				records: [
					{
						grain: "rollup",
						date: "1900-01-01",
						dimension: { kind: "page", value: "/" },
						metrics: { pageviews: 1 },
					},
				],
			}),
			"BAD_REQUEST"
		);
	});

	iit("refuses users outside the website's organization", async () => {
		const client = await setup();
		const outsider = await signUp();
		const otherOrg = await insertOrganization();
		await addToOrganization(outsider.id, otherOrg.id, "admin");
		const ingest = call(
			appRouter.imports.ingest,
			userContext(outsider, otherOrg.id)
		);

		await expectCode(
			ingest({
				websiteId: client.websiteId,
				providerId: "plausible",
				runId: crypto.randomUUID(),
				timezone: "UTC",
				records: await plausibleRecords(client.websiteId, crypto.randomUUID()),
			}),
			"FORBIDDEN"
		);
	});
});
