// Data formatting functions for different export formats

import type { ExportFormat } from './types';

export function convertToCSV<T extends Record<string, unknown>>(
	data: T[]
): string {
	if (data.length === 0) return '';

	const headers = Object.keys(data[0] || {}).join(',');
	const rows = data
		.map((row) =>
			Object.values(row)
				.map((value) => {
					if (value === null || value === undefined) {
						return '';
					}
					const stringValue = String(value);
					// Escape commas, quotes, and newlines in CSV
					if (
						stringValue.includes(',') ||
						stringValue.includes('"') ||
						stringValue.includes('\n')
					) {
						return `"${stringValue.replace(/"/g, '""')}"`;
					}
					return stringValue;
				})
				.join(',')
		)
		.join('\n');

	return `${headers}\n${rows}`;
}

export function convertToTXT<T extends Record<string, unknown>>(
	data: T[]
): string {
	if (data.length === 0) return '';

	const headers = Object.keys(data[0] || {}).join('\t');
	const rows = data
		.map((row) =>
			Object.values(row)
				.map((value) => {
					if (value === null || value === undefined) {
						return '';
					}
					// Replace tabs and newlines to maintain format
					return String(value).replace(/[\t\n\r]/g, ' ');
				})
				.join('\t')
		)
		.join('\n');

	return `${headers}\n${rows}`;
}

export function convertToProto<T extends Record<string, unknown>>(
	data: T[],
	typeName: string
): string {
	if (data.length === 0) return '';

	let protoContent = `# Protocol Buffer Text Format\n# Type: ${typeName}\n\n`;

	for (const [index, row] of data.entries()) {
		protoContent += `${typeName} {\n`;

		for (const [key, value] of Object.entries(row)) {
			if (value !== null && value !== undefined) {
				const fieldName = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');

				if (typeof value === 'string') {
					// Escape quotes in string values
					const escapedValue = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
					protoContent += `  ${fieldName}: "${escapedValue}"\n`;
				} else if (typeof value === 'number') {
					protoContent += `  ${fieldName}: ${value}\n`;
				} else if (typeof value === 'boolean') {
					protoContent += `  ${fieldName}: ${value}\n`;
				} else {
					// Convert other types to string
					const stringValue = String(value)
						.replace(/"/g, '\\"')
						.replace(/\n/g, '\\n');
					protoContent += `  ${fieldName}: "${stringValue}"\n`;
				}
			}
		}

		protoContent += '}\n';
		if (index < data.length - 1) {
			protoContent += '\n';
		}
	}

	return protoContent;
}

export function formatData<T extends Record<string, unknown>>(
	data: T[],
	format: ExportFormat,
	typeName: string
): string {
	switch (format) {
		case 'csv':
			return convertToCSV(data);
		case 'txt':
			return convertToTXT(data);
		case 'proto':
			return convertToProto(data, typeName);
		case 'json':
		default:
			return JSON.stringify(data, null, 2);
	}
}

export function getFileExtension(format: ExportFormat): string {
	switch (format) {
		case 'csv':
			return 'csv';
		case 'txt':
			return 'txt';
		case 'proto':
			return 'proto.txt';
		case 'json':
		default:
			return 'json';
	}
}
