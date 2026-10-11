import JSZip from "jszip";
import {
	ImportFileError,
	type ImportContext,
	type ImportEntry,
	type ImportFormat,
	type ImportProvider,
	type ImportRecord,
	type ImportSource,
	PAGEVIEW_EVENT_NAME,
	rollupPageviews,
	UnrecognizedImportFileError,
} from "./records";
import { plausibleProvider } from "./providers/plausible";
import { posthogProvider } from "./providers/posthog";
import { simpleAnalyticsProvider } from "./providers/simple-analytics";

const ZIP_MAGIC = [0x50, 0x4b];
const MAX_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 64;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;

export const IMPORT_PROVIDERS: ImportProvider[] = [
	plausibleProvider,
	posthogProvider,
	simpleAnalyticsProvider,
];

export async function zipSource(
	data: ArrayBuffer | Uint8Array
): Promise<ImportSource> {
	const archive = await JSZip.loadAsync(data);
	const files = Object.values(archive.files).filter((file) => !file.dir);

	if (files.length > MAX_ARCHIVE_ENTRIES) {
		throw new ImportFileError(
			`Archive has ${files.length} entries, more than the ${MAX_ARCHIVE_ENTRIES} an analytics export should contain`
		);
	}

	return {
		kind: "archive",
		// biome-ignore lint/suspicious/useAwait: async generator satisfies AsyncIterable
		async *entries(): AsyncIterable<ImportEntry> {
			let expanded = 0;
			for (const file of files) {
				yield {
					name: file.name,
					text: async () => {
						const declared = declaredSize(file);
						if (declared > MAX_ENTRY_BYTES) {
							throw new ImportFileError(
								`Archive entry ${file.name} declares ${declared} bytes, over the ${MAX_ENTRY_BYTES} byte limit`
							);
						}
						const text = await file.async("string");
						if (text.length > MAX_ENTRY_BYTES) {
							throw new ImportFileError(
								`Archive entry ${file.name} expanded to ${text.length} bytes, over the ${MAX_ENTRY_BYTES} byte limit`
							);
						}
						expanded += text.length;
						if (expanded > MAX_EXPANDED_BYTES) {
							throw new ImportFileError(
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

export interface ImportFileContents {
	format: ImportFormat;
	provider: ImportProvider;
	records: ImportRecord[];
}

export interface ImportSummary {
	firstDate: string;
	lastDate: string;
	pageviews: number;
	visitors: number;
}

export async function readImportFile(
	file: File,
	context: ImportContext
): Promise<ImportFileContents> {
	if (file.size > MAX_IMPORT_FILE_BYTES) {
		throw new ImportFileError(
			`This file is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB. Export a shorter date range and import each file separately.`
		);
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	const source = ZIP_MAGIC.every((byte, index) => bytes[index] === byte)
		? await zipSource(bytes)
		: fileSource(file.name, new TextDecoder().decode(bytes));

	for (const provider of IMPORT_PROVIDERS) {
		const format = await provider.detect(source);
		if (!format) {
			continue;
		}
		const records: ImportRecord[] = [];
		for await (const record of provider.parse(source, context)) {
			records.push(record);
		}
		return { provider, format, records };
	}
	throw new UnrecognizedImportFileError(
		"This file isn't an export from Plausible, PostHog or Simple Analytics."
	);
}

export function summarizeImport(records: ImportRecord[]): ImportSummary | null {
	const dates: string[] = [];
	const visitorKeys = new Set<string>();
	let pageviews = 0;
	let rollupVisitors = 0;
	for (const record of records) {
		if (record.grain === "rollup") {
			dates.push(record.date);
			if (record.dimension === null) {
				rollupVisitors += record.metrics.visitors ?? 0;
			}
			continue;
		}
		if (record.eventName === PAGEVIEW_EVENT_NAME) {
			pageviews += 1;
			visitorKeys.add(record.visitorKey);
			dates.push(record.time.toISOString().slice(0, 10));
		}
	}
	pageviews += rollupPageviews(records);
	dates.sort();
	const [firstDate] = dates;
	const lastDate = dates.at(-1);
	if (!(pageviews > 0 && firstDate && lastDate)) {
		return null;
	}
	return {
		firstDate,
		lastDate,
		pageviews,
		visitors: rollupVisitors + visitorKeys.size,
	};
}
