import type { ErrorCategory } from '@databuddy/shared';

export { formatDateTime, formatDateTimeSeconds } from '@/lib/formatters';

export const getErrorCategory = (errorMessage: string): ErrorCategory => {
	if (!errorMessage) {
		return { type: 'Unknown Error', category: 'Other', severity: 'low' };
	}

	const message = errorMessage.toLowerCase();

	if (message.includes('react error')) {
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

export const getSeverityColor = (
	severity: 'high' | 'medium' | 'low'
): string => {
	const colors = {
		high: 'bg-primary/10 text-primary border-primary/20',
		medium: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
		low: 'bg-chart-3/10 text-chart-3 border-chart-3/20',
	};
	return (
		colors[severity] || 'bg-muted/10 text-muted-foreground border-muted/20'
	);
};
