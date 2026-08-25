import { dayjs } from "@databuddy/ui";
import type { Annotation } from "@/types/annotations";

type Granularity = "hourly" | "daily" | "weekly" | "monthly";
function formatAnnotationDate(date: Date | string, showTime = false): string {
	const dateObj = dayjs(date);
	if (showTime) {
		return dateObj.format("MMM D, h:mm A");
	}
	return dateObj.format("MMM D, YYYY");
}
export function formatAnnotationDateRange(
	start: Date | string,
	end: Date | string | null,
	granularity: Granularity = "daily"
): string {
	const startDate = dayjs(start);
	const endDate = end ? dayjs(end) : null;

	// If hourly granularity, always show time
	const isHourly = granularity === "hourly";

	if (!endDate || startDate.isSame(endDate)) {
		// For single date, show time if hourly or if time is not midnight
		const showTime = isHourly || !startDate.isSame(startDate.startOf("day"));
		return formatAnnotationDate(start, showTime);
	}

	// Check if the range spans less than 24 hours or if times differ on same day
	const isHourlyRange =
		startDate.isSame(endDate, "day") || endDate.diff(startDate, "hour") < 24;

	// If hourly granularity or range is within same day, show time
	const showTime =
		isHourly || isHourlyRange || startDate.isSame(endDate, "day");

	return `${formatAnnotationDate(start, showTime)} - ${formatAnnotationDate(end as Date | string, showTime)}`;
}
export function isSingleDayAnnotation(annotation: Annotation): boolean {
	if (annotation.annotationType !== "range" || !annotation.xEndValue) {
		return false;
	}

	const startTime = new Date(annotation.xValue).getTime();
	const endTime = new Date(annotation.xEndValue).getTime();

	return startTime === endTime;
}
export function validateAnnotationForm(data: {
	text: string;
	tags: string[];
	color: string;
}): { isValid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!data.text.trim()) {
		errors.push("Annotation text is required");
	}

	if (data.text.length > 500) {
		errors.push("Annotation text must be 500 characters or less");
	}

	if (!data.color) {
		errors.push("Annotation color is required");
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}
export function sanitizeAnnotationText(text: string): string {
	return text.trim().slice(0, 500);
}
