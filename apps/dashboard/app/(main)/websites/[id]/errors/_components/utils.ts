import { format, isValid, parseISO } from 'date-fns';

// Helper function to safely parse dates
export const safeDateParse = (dateString: string): Date => {
	if (!dateString) {
		return new Date();
	}

	let date = parseISO(dateString);
	if (isValid(date)) {
		return date;
	}

	const isoString = dateString.replace(' ', 'T');
	date = parseISO(isoString);
	if (isValid(date)) {
		return date;
	}

	date = new Date(dateString);
	if (isValid(date)) {
		return date;
	}

	console.warn('Failed to parse date:', dateString);
	return new Date();
};

export const safeFormatDate = (
	dateString: string,
	formatString: string
): string => {
	try {
		const date = safeDateParse(dateString);
		return format(date, formatString);
	} catch (error) {
		console.warn('Failed to format date:', dateString, error);
		return dateString;
	}
};

// Helper function to categorize errors
export const categorizeError = (
	errorMessage: string
): { type: string; category: string; severity: 'high' | 'medium' | 'low' } => {
	if (!errorMessage) {
		return { type: 'Unknown Error', category: 'Other', severity: 'low' };
	}

	const message = errorMessage.toLowerCase();

	if (
		message.includes('react error #185') ||
		message.includes('react error #418') ||
		message.includes('react error #419')
	) {
		return { type: 'React Error', category: 'React', severity: 'high' };
	}
	if (message.includes('script error')) {
		return { type: 'Script Error', category: 'JavaScript', severity: 'medium' };
	}
	if (message.includes('network')) {
		return { type: 'Network Error', category: 'Network', severity: 'medium' };
	}
	if (message.includes('syntax')) {
		return { type: 'Syntax Error', category: 'JavaScript', severity: 'high' };
	}
	if (message.includes('reference')) {
		return {
			type: 'Reference Error',
			category: 'JavaScript',
			severity: 'high',
		};
	}
	if (message.includes('type')) {
		return { type: 'Type Error', category: 'JavaScript', severity: 'medium' };
	}

	return { type: 'Unknown Error', category: 'Other', severity: 'low' };
};

export const getSeverityColor = (severity: 'high' | 'medium' | 'low') => {
	switch (severity) {
		case 'high':
			return 'bg-red-100 text-red-800 border-red-200';
		case 'medium':
			return 'bg-yellow-100 text-yellow-800 border-yellow-200';
		case 'low':
			return 'bg-blue-100 text-blue-800 border-blue-200';
		default:
			return 'bg-gray-100 text-gray-800 border-gray-200';
	}
};

export const normalizeData = (data: any[]): any[] =>
	data?.map((item) => ({
		...item,
		name: item.name || 'Unknown',
	})) || [];
