const LOCALE = "en-US" as const;
export function formatLocaleNumber(value: number): string {
	return value.toLocaleString(LOCALE);
}
