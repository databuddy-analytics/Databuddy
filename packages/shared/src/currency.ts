const ISO_CURRENCY_CODES = new Set(Intl.supportedValuesOf("currency"));

export function normalizeCurrencyCode(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const currency = value.trim().toUpperCase();
	return ISO_CURRENCY_CODES.has(currency) ? currency : null;
}

export function isCurrencyCode(value: string): boolean {
	return normalizeCurrencyCode(value) !== null;
}
