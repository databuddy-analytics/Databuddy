import { describe, expect, it } from "bun:test";
import { findPolicyViolations } from "./lint-policy";

describe("policy lint", () => {
	it("blocks direct dashboard controls outside the component library", () => {
		const violations = findPolicyViolations(
			"apps/dashboard/app/example.tsx",
			"export function Example() { return <button>Save</button>; }"
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"dashboard/no-raw-interactive-html"
		);
	});

	it("allows native controls inside the component library", () => {
		expect(
			findPolicyViolations(
				"apps/dashboard/components/ui/button.tsx",
				"export function Button() { return <button>Save</button>; }"
			)
		).toEqual([]);
	});

	it("requires a reasoned policy ignore for an intentional exception", () => {
		expect(
			findPolicyViolations(
				"apps/dashboard/app/example.tsx",
				"// policy-ignore dashboard/no-raw-interactive-html: Native button is required by the embedded vendor SDK.\nexport function Example() { return <button>Save</button>; }"
			)
		).toEqual([]);
	});

	it("blocks direct Radix and Base UI imports", () => {
		const violations = findPolicyViolations(
			"apps/dashboard/app/example.tsx",
			' import { Dialog } from "@radix-ui/react-dialog";'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"dashboard/no-raw-interactive-html"
		);
	});

	it("blocks Tailwind palette classes and literal colors", () => {
		const violations = findPolicyViolations(
			"apps/dashboard/app/example.tsx",
			'export const className = "bg-red-500 text-[#abcd12]";'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"dashboard/no-custom-color"
		);
	});

	it("blocks Tailwind palette classes inside template literals", () => {
		const violations = findPolicyViolations(
			"apps/dashboard/app/example.tsx",
			"export const className = `bg-red-500 ${active ? 'text-primary' : ''}`;"
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"dashboard/no-custom-color"
		);
	});

	it("allows hash link targets that are not color values", () => {
		expect(
			findPolicyViolations(
				"apps/dashboard/app/example.tsx",
				'export function Example() { return <a href="#abc">Jump</a>; }'
			)
		).toEqual([]);
	});

	it("allows semantic design tokens", () => {
		expect(
			findPolicyViolations(
				"apps/dashboard/app/example.tsx",
				'export const className = "bg-primary text-destructive";'
			)
		).toEqual([]);
	});

	it("blocks JSON error payloads in HTTP handlers", () => {
		const violations = findPolicyViolations(
			"apps/api/src/routes/example.ts",
			'Response.json({ error: "Not found" }, { status: 404 });'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"http/no-custom-json-error-response"
		);
	});

	it("blocks quoted JSON error payload keys", () => {
		const violations = findPolicyViolations(
			"apps/api/src/routes/example.ts",
			'Response.json({ "error": "Not found" }, { status: 404 });'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"http/no-custom-json-error-response"
		);
	});

	it("blocks local JSON error payload variables", () => {
		const violations = findPolicyViolations(
			"apps/api/src/routes/example.ts",
			'const payload = { error: "Not found" };\nResponse.json(payload, { status: 404 });'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"http/no-custom-json-error-response"
		);
	});

	it("blocks Elysia handlers that return error objects", () => {
		const violations = findPolicyViolations(
			"apps/api/src/routes/example.ts",
			"const handler = ({ set }: { set: unknown }) => { return { error: 'Not found' }; };"
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"http/no-custom-json-error-response"
		);
	});
});
