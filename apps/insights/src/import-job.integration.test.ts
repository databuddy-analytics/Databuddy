import "@databuddy/test/env";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { config, type StorageConfig } from "@databuddy/env/app";
import {
	closeImportQueue,
	getBullMQWorkerConnectionOptions,
	getImportQueue,
	IMPORT_QUEUE_ENV_PREFIX,
	IMPORT_QUEUE_NAME,
	importRunJobId,
	type ImportRunJobData,
} from "@databuddy/redis";
import { appRouter } from "@databuddy/rpc";
import {
	addToOrganization,
	cleanup,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
	userContext,
} from "@databuddy/test";
import { createProcedureClient } from "@orpc/server";
import { Worker } from "bullmq";
import JSZip from "jszip";
import { IMPORT_FAILED_MESSAGE, processImportJob } from "./import-job";

const describeIntegration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const PLAUSIBLE_EXPORT = {
	"imported_visitors_20260304_20260305.csv":
		"date,visitors,pageviews,bounces,visits,visit_duration\n2026-03-04,10,20,5,10,100\n2026-03-05,4,6,2,4,40\n",
	"imported_pages_20260304_20260305.csv":
		"date,hostname,page,visits,visitors,pageviews\n2026-03-04,example.com,/,10,10,20\n2026-03-05,example.com,/pricing,4,4,6\n",
};

const objects = new Map<string, ArrayBuffer>();
const objectStore = Bun.serve({
	port: 0,
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (request.method === "PUT") {
			objects.set(pathname, await request.arrayBuffer());
			return new Response(null, { status: 200 });
		}
		const body = objects.get(pathname);
		return body
			? new Response(body)
			: new Response("NoSuchKey", { status: 404 });
	},
});

const storage: StorageConfig = {
	accessKeyId: "test-access-key",
	secretAccessKey: "test-secret-key",
	endpoint: objectStore.url.origin,
	publicUrl: objectStore.url.origin,
	region: "auto",
};

const websiteIds: string[] = [];

async function setup() {
	const organization = await insertOrganization();
	const website = await insertWebsite({
		organizationId: organization.id,
		domain: "example.com",
	});
	const user = await signUp();
	await addToOrganization(user.id, organization.id, "owner");
	websiteIds.push(website.id);
	const ctx = { context: userContext(user, organization.id) };
	return {
		websiteId: website.id,
		createUpload: createProcedureClient(appRouter.imports.createUpload, ctx),
		start: createProcedureClient(appRouter.imports.start, ctx),
		status: createProcedureClient(appRouter.imports.status, ctx),
	};
}

async function upload(
	client: Awaited<ReturnType<typeof setup>>,
	body: Uint8Array<ArrayBuffer>,
	contentType: "application/zip" | "text/csv"
) {
	const { key, uploadUrl } = await client.createUpload({
		websiteId: client.websiteId,
		contentLength: body.byteLength,
		contentType,
	});
	const response = await fetch(uploadUrl, {
		method: "PUT",
		body,
		headers: { "content-type": contentType },
	});
	expect(response.ok).toBe(true);
	return key;
}

async function plausibleZip() {
	const zip = new JSZip();
	for (const [name, contents] of Object.entries(PLAUSIBLE_EXPORT)) {
		zip.file(name, contents);
	}
	return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

async function settledStatus(
	client: Awaited<ReturnType<typeof setup>>,
	runId: string
) {
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		const status = await client.status({ websiteId: client.websiteId, runId });
		if (status.state === "completed" || status.failedReason) {
			return status;
		}
		await Bun.sleep(100);
	}
	throw new Error(`Import run ${runId} did not settle`);
}

let worker: Worker<ImportRunJobData> | null = null;

function startWorker() {
	worker = new Worker<ImportRunJobData>(IMPORT_QUEUE_NAME, processImportJob, {
		connection: getBullMQWorkerConnectionOptions({
			envPrefix: IMPORT_QUEUE_ENV_PREFIX,
		}),
	});
}

describeIntegration("analytics import through the worker", () => {
	beforeEach(async () => {
		await reset();
		config.storage = storage;
	});

	afterEach(async () => {
		await worker?.close();
		worker = null;
		await getImportQueue().obliterate({ force: true });
	});

	afterAll(async () => {
		await clickHouse.command({
			query: `ALTER TABLE ${TABLE_NAMES.events} DELETE WHERE client_id IN {websiteIds:Array(String)}`,
			query_params: { websiteIds },
			clickhouse_settings: { mutations_sync: "1" },
		});
		objectStore.stop(true);
		await closeImportQueue();
		await cleanup();
	}, 30_000);

	it("writes the export's rows and reports them", async () => {
		const client = await setup();
		const storageKey = await upload(
			client,
			await plausibleZip(),
			"application/zip"
		);
		const { runId } = await client.start({
			websiteId: client.websiteId,
			providerId: "plausible",
			storageKey,
			replaceExisting: false,
			timezone: "UTC",
		});
		startWorker();

		const status = await settledStatus(client, runId);
		expect(status.failedReason).toBeNull();
		expect(status.state).toBe("completed");
		expect(status.rows).toBeGreaterThan(0);

		const result = await clickHouse.query({
			query: `SELECT count() AS rows FROM ${TABLE_NAMES.events} WHERE client_id = {websiteId:String}`,
			query_params: { websiteId: client.websiteId },
			format: "JSONEachRow",
		});
		const [{ rows }] = await result.json<{ rows: string }>();
		expect(Number(rows)).toBe(status.rows);
	}, 30_000);

	it("tells the customer when the file is not the chosen provider's export", async () => {
		const client = await setup();
		const storageKey = await upload(
			client,
			new TextEncoder().encode("name,email\nada,ada@example.com\n"),
			"text/csv"
		);
		const { runId } = await client.start({
			websiteId: client.websiteId,
			providerId: "plausible",
			storageKey,
			replaceExisting: false,
			timezone: "UTC",
		});
		startWorker();

		const status = await settledStatus(client, runId);
		expect(status.state).toBe("failed");
		expect(status.failedReason).toBe("Uploaded file is not a Plausible export");
	}, 30_000);

	it("never shows the customer the worker's internal error", async () => {
		const client = await setup();
		const storageKey = await upload(
			client,
			await plausibleZip(),
			"application/zip"
		);
		const { runId } = await client.start({
			websiteId: client.websiteId,
			providerId: "plausible",
			storageKey,
			replaceExisting: false,
			timezone: "UTC",
		});
		config.storage = undefined;
		startWorker();

		const status = await settledStatus(client, runId);
		expect(status.failedReason).toBe(IMPORT_FAILED_MESSAGE);
		expect(status.rows).toBe(0);

		const job = await getImportQueue().getJob(importRunJobId(runId));
		expect(job?.attemptsMade).toBe(1);
	}, 30_000);
});
