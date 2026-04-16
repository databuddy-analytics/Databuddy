import { describe, expect, test } from "vitest";

// ── Table-driven test runners ──

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

export function asyncCases<I, O>(
	name: string,
	table: Case<I, O>[],
	fn: (input: I) => Promise<O>
) {
	describe(name, () => {
		for (const [label, input, expected] of table) {
			test(label, async () => expect(await fn(input)).toEqual(expected));
		}
	});
}

export function truthTable<A, B>(
	name: string,
	table: [label: string, a: A, b: B, expected: boolean][],
	fn: (a: A, b: B) => boolean
) {
	describe(name, () => {
		for (const [label, a, b, expected] of table) {
			test(label, () => expect(fn(a, b)).toBe(expected));
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

// ── IP generators ──

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

export function randomIPv6(): string {
	return Array.from({ length: 8 }, () =>
		Math.floor(Math.random() * 0x1_00_00)
			.toString(16)
			.padStart(4, "0")
	).join(":");
}

// ── String generators ──

export const CONTROL_CHARS = "\x00\x01\x07\x08\x0B\x0C\x0E\x1F\x7F";
export const XSS_PAYLOADS = [
	"<script>alert(1)</script>",
	'<img onerror="alert(1)" src=x>',
	"javascript:alert(1)",
	'"><svg onload=alert(1)>',
	"' OR 1=1 --",
	// biome-ignore lint/suspicious/noTemplateCurlyInString: intentional XSS payload
	"${7*7}",
	"{{constructor.constructor('return this')()}}",
];

export function longString(n: number, char = "a"): string {
	return char.repeat(n);
}

// ── Request factory ──

export function req(
	url = "https://example.com",
	headers: Record<string, string> = {}
): Request {
	return new Request(url, { headers });
}
