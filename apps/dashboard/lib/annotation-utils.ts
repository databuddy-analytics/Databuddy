import dayjs from 'dayjs';
import type { Annotation } from '@/types/annotations';

type Granularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * Formats a date to a readable string
	 * Shows time if the date is within a 24-hour period or spans less than a day
 */
export function formatAnnotationDate(date: Date | string, showTime = false): string {
	const dateObj = dayjs(date);
	if (showTime) {
		return dateObj.format('MMM D, h:mm A');
	}
	return dateObj.format('MMM D, YYYY');
}

/**
 * Formats a date range for annotations
 * Automatically detects if hourly format is needed based on granularity or date range
 */
export function formatAnnotationDateRange(
	start: Date | string,
	end: Date | string | null,
	granularity: Granularity = 'daily'
): string {
	const startDate = dayjs(start);
	const endDate = end ? dayjs(end) : null;
	
	// If hourly granularity, always show time
	const isHourly = granularity === 'hourly';
	
	if (!endDate || startDate.isSame(endDate)) {
		// For single date, show time if hourly or if time is not midnight
		const showTime = isHourly || !startDate.isSame(startDate.startOf('day'));
		return formatAnnotationDate(start, showTime);
	}
	
	// Check if the range spans less than 24 hours or if times differ on same day
	const isHourlyRange = startDate.isSame(endDate, 'day') || endDate.diff(startDate, 'hour') < 24;
	
	// If hourly granularity or range is within same day, show time
	const showTime = isHourly || isHourlyRange || startDate.isSame(endDate, 'day');
	
	return `${formatAnnotationDate(start, showTime)} - ${formatAnnotationDate(end as Date | string, showTime)}`;
}

/**
 * Checks if an annotation is a single-day range
 */
export function isSingleDayAnnotation(annotation: Annotation): boolean {
	if (annotation.annotationType !== 'range' || !annotation.xEndValue) {
		return false;
	}
	
	const startTime = new Date(annotation.xValue).getTime();
	const endTime = new Date(annotation.xEndValue).getTime();
	
	return startTime === endTime;
}

/**
 * Gets the display date for chart rendering
 * Matches the format used by formatDateByGranularity
 */
export function getChartDisplayDate(date: Date | string, granularity: Granularity = 'daily'): string {
	const dateObj = dayjs(date);
	return granularity === 'hourly'
		? dateObj.format('MMM D, h:mm A')
		: dateObj.format('MMM D');
}

/**
 * Validates annotation form data
 */
export function validateAnnotationForm(data: {
	text: string;
	tags: string[];
	color: string;
}): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];
	
	if (!data.text.trim()) {
		errors.push('Annotation text is required');
	}
	
	if (data.text.length > 500) {
		errors.push('Annotation text must be 500 characters or less');
	}
	
	if (!data.color) {
		errors.push('Annotation color is required');
	}
	
	return {
		isValid: errors.length === 0,
		errors,
	};
}

/**
 * Generates a unique annotation ID
 */
export function generateAnnotationId(): string {
	return `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitizes annotation text
 */
export function sanitizeAnnotationText(text: string): string {
	return text.trim().slice(0, 500);
}

/**
 * Formats annotation tags for display
 */
export function formatAnnotationTags(tags: string[] | null): string[] {
	if (!tags || tags.length === 0) return [];
	return tags.filter(tag => tag.trim().length > 0);
}
