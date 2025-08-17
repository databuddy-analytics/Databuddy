// Main export orchestrator

import { logger } from '../logger';
import { fetchExportData } from './data-fetcher';
import {
	createZipBuffer,
	generateExportFilename,
	generateExportFiles,
	generateMetadataFile,
} from './file-generator';
import type { ExportRequest } from './types';

export interface ExportResult {
	buffer: Buffer;
	filename: string;
	metadata: {
		websiteId: string;
		format: string;
		totalRecords: number;
		fileSize: number;
	};
}

export async function processExport(
	request: ExportRequest
): Promise<ExportResult> {
	const { website_id: websiteId, format = 'json' } = request;

	logger.info('Starting data export', {
		websiteId,
		startDate: request.start_date,
		endDate: request.end_date,
		format,
	});

	// Fetch data from ClickHouse
	const data = await fetchExportData(request);

	logger.info('Data export queries completed', {
		websiteId,
		eventsCount: data.events.length,
		errorsCount: data.errors.length,
		webVitalsCount: data.webVitals.length,
	});

	// Generate export files
	const exportFiles = generateExportFiles(data, format);
	const metadataFile = generateMetadataFile(request, data);
	const allFiles = [...exportFiles, metadataFile];

	// Create ZIP buffer
	const buffer = await createZipBuffer(allFiles);
	const filename = generateExportFilename(websiteId);

	const totalRecords =
		data.events.length + data.errors.length + data.webVitals.length;

	logger.info('Data export completed successfully', {
		websiteId,
		filename,
		totalSize: buffer.length,
		totalRecords,
	});

	return {
		buffer,
		filename,
		metadata: {
			websiteId,
			format,
			totalRecords,
			fileSize: buffer.length,
		},
	};
}

// Re-export types for convenience
export type {
	ExportFormat,
	ExportRequest,
	SanitizedError,
	SanitizedEvent,
	SanitizedWebVitals,
} from './types';
