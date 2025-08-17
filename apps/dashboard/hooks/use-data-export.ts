import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export type ExportFormat = 'json' | 'csv' | 'txt' | 'proto';

interface UseDataExportOptions {
	websiteId: string;
	websiteName?: string;
}

interface ExportParams {
	format: ExportFormat;
	startDate?: string;
	endDate?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// Regex for extracting filename from Content-Disposition header
const FILENAME_REGEX = /filename="(.+)"/;

// Helper function to handle file download
function downloadFile(blob: Blob, filename: string) {
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();

	// Cleanup
	window.URL.revokeObjectURL(url);
	document.body.removeChild(a);
}

// Helper function to extract filename from response
function getFilenameFromResponse(
	response: Response,
	websiteName?: string
): string {
	const contentDisposition = response.headers.get('Content-Disposition');
	const defaultFilename = `${websiteName || 'website'}-export-${new Date().toISOString().split('T')[0]}.zip`;

	if (contentDisposition) {
		const filenameMatch = contentDisposition.match(FILENAME_REGEX);
		if (filenameMatch) {
			return filenameMatch[1];
		}
	}

	return defaultFilename;
}

// Main export function
async function exportDataFromAPI(
	websiteId: string,
	websiteName: string | undefined,
	{ format = 'csv', startDate, endDate }: ExportParams
): Promise<{ filename: string }> {
	const response = await fetch(`${API_BASE_URL}/v1/export/data`, {
		method: 'POST',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			website_id: websiteId,
			format,
			start_date: startDate,
			end_date: endDate,
		}),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || 'Export failed');
	}

	const filename = getFilenameFromResponse(response, websiteName);
	const blob = await response.blob();

	downloadFile(blob, filename);

	return { filename };
}

export function useDataExport({
	websiteId,
	websiteName,
}: UseDataExportOptions) {
	return useMutation({
		mutationFn: (params: ExportParams) =>
			exportDataFromAPI(websiteId, websiteName, params),
		onSuccess: () => {
			toast.success('Data exported successfully!');
		},
		onError: (error: Error) => {
			const errorMessage = error.message || 'Export failed';
			toast.error(errorMessage);
		},
	});
}
