import { describe, expect, test } from "vitest";

type Case<I, O> = [label: string, input: I, expected: O];

export function cases<I, O>(
	name: string,
	table: Case<I, O>[],
	fn: (input: I) => O
) {
	describe(name, () => {
		for (const [label, input, expected] of table) {
			test(label, () => expect(fn(input)).toEqual(expected));
		}
	});
}

export function schemaTable(
	name: string,
	schema: { safeParse: (v: unknown) => { success: boolean } },
	valid: [string, unknown][],
	invalid: [string, unknown][]
) {
	describe(name, () => {
		for (const [label, input] of valid) {
			test(`accepts: ${label}`, () =>
				expect(schema.safeParse(input).success).toBe(true));
		}
		for (const [label, input] of invalid) {
			test(`rejects: ${label}`, () =>
				expect(schema.safeParse(input).success).toBe(false));
		}
	});
}

export function randomIPv4(): string {
	return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join(
		"."
	);
}

export function randomPublicIPv4(): string {
	for (;;) {
		const a = Math.floor(Math.random() * 223) + 1;
		if (a === 10 || a === 127) {
			continue;
		}
		const b = Math.floor(Math.random() * 256);
		if (a === 172 && b >= 16 && b <= 31) {
			continue;
		}
		if (a === 192 && b === 168) {
			continue;
		}
		return `${a}.${b}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
	}
}

export function longString(n: number, char = "a"): string {
	return char.repeat(n);
}

export function req(
	url = "https://example.com",
	headers: Record<string, string> = {}
): Request {
	return new Request(url, { headers });
}
