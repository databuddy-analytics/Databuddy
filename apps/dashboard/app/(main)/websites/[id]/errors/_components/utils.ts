import type { ErrorCategory } from "@databuddy/shared/types/errors";

const UNKNOWN_ERROR: ErrorCategory = {
	type: "Unknown Error",
	category: "Other",
	severity: "low",
};

const CATEGORY_RULES: Array<{ match: string; category: ErrorCategory }> = [
	{
		match: "react error",
		category: { type: "React Error", category: "React", severity: "high" },
	},
	{
		match: "script error",
		category: {
			type: "Script Error",
			category: "JavaScript",
			severity: "medium",
		},
	},
	{
		match: "network",
		category: {
			type: "Network Error",
			category: "Network",
			severity: "medium",
		},
	},
	{
		match: "syntax",
		category: {
			type: "Syntax Error",
			category: "JavaScript",
			severity: "high",
		},
	},
	{
		match: "reference",
		category: {
			type: "Reference Error",
			category: "JavaScript",
			severity: "high",
		},
	},
	{
		match: "type",
		category: {
			type: "Type Error",
			category: "JavaScript",
			severity: "medium",
		},
	},
];

export const getErrorCategory = (errorMessage: string): ErrorCategory => {
	if (!errorMessage) {
		return UNKNOWN_ERROR;
	}
	const message = errorMessage.toLowerCase();
	return (
		CATEGORY_RULES.find((rule) => message.includes(rule.match))?.category ??
		UNKNOWN_ERROR
	);
};

const SEVERITY_COLORS: Record<"high" | "medium" | "low", string> = {
	high: "bg-destructive/10 text-destructive border-destructive/20",
	medium:
		"bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400",
	low: "bg-muted text-muted-foreground border-border",
};

export const getSeverityColor = (severity: "high" | "medium" | "low"): string =>
	SEVERITY_COLORS[severity];
