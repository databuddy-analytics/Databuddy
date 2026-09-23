import { db } from "@databuddy/db";
import type { ImportRunJobData } from "@databuddy/redis";
import JSZip from "jszip";
import { createImportDownloadUrl } from "../storage";
import {
	deleteImportedEvents,
	type ImportEntry,
	type ImportProvider,
	type ImportResult,
	type ImportSource,
	runImport,
} from "./pipeline";
import { plausibleProvider } from "./providers/plausible";
import { simpleAnalyticsProvider } from "./providers/simple-analytics";

const ZIP_MAGIC = [0x50, 0x4b];
const MAX_ARCHIVE_ENTRIES = 64;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;

export const IMPORT_PROVIDERS: ImportProvider[] = [
	plausibleProvider,
	simpleAnalyticsProvider,
];

export function getImportProvider(id: string): ImportProvider | undefined {
	return IMPORT_PROVIDERS.find((provider) => provider.id === id);
}

export async function detectImportProvider(
	source: ImportSource
): Promise<ImportProvider | undefined> {
	for (const provider of IMPORT_PROVIDERS) {
		if (await provider.detect(source)) {
			return provider;
		}
	}
	return;
}

export async function zipSource(
	data: ArrayBuffer | Uint8Array
): Promise<ImportSource> {
	const archive = await JSZip.loadAsync(data);
	const files = Object.values(archive.files).filter((file) => !file.dir);

	if (files.length > MAX_ARCHIVE_ENTRIES) {
		throw new Error(
			`Archive has ${files.length} entries, more than the ${MAX_ARCHIVE_ENTRIES} an analytics export should contain`
		);
	}

	return {
		kind: "archive",
		// biome-ignore lint/suspicious/useAwait: async generator satisfies AsyncIterable
		async *entries(): AsyncIterable<ImportEntry> {
			let expanded = 0;
			for (const file of files) {
				const declared = declaredSize(file);
				if (declared > MAX_ENTRY_BYTES) {
					throw new Error(
						`Archive entry ${file.name} declares ${declared} bytes, over the ${MAX_ENTRY_BYTES} byte limit`
					);
				}
				yield {
					name: file.name,
					text: async () => {
						const text = await file.async("string");
						if (text.length > MAX_ENTRY_BYTES) {
							throw new Error(
								`Archive entry ${file.name} expanded to ${text.length} bytes, over the ${MAX_ENTRY_BYTES} byte limit`
							);
						}
						expanded += text.length;
						if (expanded > MAX_EXPANDED_BYTES) {
							throw new Error(
								`Archive expanded past the ${MAX_EXPANDED_BYTES} byte limit`
							);
						}
						return text;
					},
				};
			}
		},
	};
}

function declaredSize(file: JSZip.JSZipObject): number {
	const data = (file as { _data?: { uncompressedSize?: number } })._data;
	return typeof data?.uncompressedSize === "number" ? data.uncompressedSize : 0;
}

export function fileSource(name: string, contents: string): ImportSource {
	return { kind: "file", name, text: () => Promise.resolve(contents) };
}

export async function runImportJob(
	data: ImportRunJobData,
	onProgress?: (progress: { rows: number }) => void | Promise<void>
): Promise<ImportResult> {
	const provider = getImportProvider(data.providerId);
	if (!provider) {
		throw new Error(`Unknown import provider: ${data.providerId}`);
	}

	const website = await db.query.websites.findFirst({
		where: { id: data.websiteId },
		columns: { domain: true, organizationId: true },
	});
	if (!website) {
		throw new Error(`Website not found: ${data.websiteId}`);
	}
	if (website.organizationId !== data.organizationId) {
		throw new Error(
			`Website ${data.websiteId} belongs to another organization`
		);
	}

	const response = await fetch(createImportDownloadUrl(data.storageKey));
	if (!response.ok) {
		throw new Error(`Import object fetch failed with ${response.status}`);
	}
	const body = new Uint8Array(await response.arrayBuffer());
	const source = ZIP_MAGIC.every((byte, index) => body[index] === byte)
		? await zipSource(body)
		: fileSource(data.storageKey, new TextDecoder().decode(body));

	if (!(await provider.detect(source))) {
		throw new Error(`Uploaded file is not a ${provider.label} export`);
	}

	const result = await runImport({
		provider,
		source,
		context: {
			websiteId: data.websiteId,
			runId: data.runId,
			domain: website.domain,
			timezone: data.timezone,
		},
		onProgress,
	});

	if (data.replaceExisting) {
		await deleteImportedEvents({
			websiteId: data.websiteId,
			providerId: provider.id,
			exceptRunId: data.runId,
		});
	}

	return result;
}
