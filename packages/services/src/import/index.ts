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

	return {
		kind: "archive",
		// biome-ignore lint/suspicious/useAwait: async generator satisfies AsyncIterable
		async *entries(): AsyncIterable<ImportEntry> {
			for (const file of files) {
				yield { name: file.name, text: () => file.async("string") };
			}
		},
	};
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

	if (data.replaceExisting) {
		await deleteImportedEvents(data.websiteId, provider.id);
	}

	return await runImport({
		provider,
		source,
		context: {
			websiteId: data.websiteId,
			domain: website.domain,
			timezone: data.timezone,
		},
		onProgress,
	});
}

export * from "./pipeline";
