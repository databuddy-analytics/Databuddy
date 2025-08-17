// File generation and ZIP creation

import JSZip from 'jszip';
import type { ExportData } from './data-fetcher';
import { formatData, getFileExtension } from './formatters';
import type {
	ExportFile,
	ExportFormat,
	ExportMetadata,
	ExportRequest,
} from './types';

export function generateExportFiles(
	data: ExportData,
	format: ExportFormat
): ExportFile[] {
	const extension = getFileExtension(format);

	return [
		{
			name: `events.${extension}`,
			content: formatData(data.events, format, 'Event'),
		},
		{
			name: `errors.${extension}`,
			content: formatData(data.errors, format, 'Error'),
		},
		{
			name: `web_vitals.${extension}`,
			content: formatData(data.webVitals, format, 'WebVital'),
		},
	];
}

export function generateMetadataFile(
	request: ExportRequest,
	data: ExportData
): ExportFile {
	const metadata: ExportMetadata = {
		export_date: new Date().toISOString(),
		website_id: request.website_id,
		date_range: {
			start: request.start_date || 'all_time',
			end: request.end_date || 'all_time',
		},
		format: request.format || 'json',
		counts: {
			events: data.events.length,
			errors: data.errors.length,
			web_vitals: data.webVitals.length,
		},
	};

	return {
		name: 'metadata.json',
		content: JSON.stringify(metadata, null, 2),
	};
}

export async function createZipBuffer(files: ExportFile[]): Promise<Buffer> {
	const zip = new JSZip();

	for (const file of files) {
		zip.file(file.name, file.content);
	}

	return await zip.generateAsync({ type: 'nodebuffer' });
}

export function generateExportFilename(websiteId: string): string {
	const date = new Date().toISOString().slice(0, 10);
	return `databuddy_export_${websiteId}_${date}.zip`;
}
