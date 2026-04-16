import { formatNumber } from "@/lib/formatters";
import type { QueryCell } from "./types";

export interface FormatOptions {
	/** Override auto-detection of field type */
	forceType?: "rate" | "duration" | "number" | "string";
}

/**
 * Format a value for display in a dashboard widget.
 * Auto-detects formatting based on field name patterns.
 */
export function formatWidgetValue(
	value: QueryCell | undefined,
	field: string,
	options?: FormatOptions
): string {
	if (value === null || value === undefined) {
		return "—";
	}

	if (typeof value === "boolean") {
		return value ? "True" : "False";
	}

	const num = typeof value === "number" ? value : Number(value);
	const isValidNumber = typeof value === "number" || !Number.isNaN(num);

	if (!isValidNumber) {
		return String(value);
	}

	const fieldType = options?.forceType ?? detectFieldType(field);

	switch (fieldType) {
		case "rate":
			return `${num.toFixed(1)}%`;
		case "duration":
			return formatDuration(num);
		case "number":
			return formatNumber(num);
		default:
			return String(value);
	}
}

function detectFieldType(
	field: string
): "rate" | "duration" | "number" | "string" {
	const lower = field.toLowerCase();

	if (lower.includes("rate") || lower.includes("percentage")) {
		return "rate";
	}

	if (lower.includes("duration") || lower.includes("time")) {
		return "duration";
	}

	return "number";
}

function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Parse a value to a number, returning 0 for invalid values
 */
export function parseNumericValue(value: QueryCell | undefined): number {
	if (value === null || value === undefined) {
		return 0;
	}

	if (typeof value === "number") {
		return Number.isNaN(value) ? 0 : value;
	}

	if (typeof value === "string") {
		const num = Number(value);
		return Number.isNaN(num) ? 0 : num;
	}

	return 0;
}
