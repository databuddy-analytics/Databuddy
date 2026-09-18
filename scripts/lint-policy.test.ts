import { describe, expect, it } from "bun:test";
import { findPolicyViolations, findTestWiringViolations } from "./lint-policy";

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

	it("blocks Tailwind palette classes with postfix important modifiers", () => {
		const violations = findPolicyViolations(
			"apps/dashboard/app/example.tsx",
			'export const className = "bg-red-500! hover:text-blue-600!";'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"dashboard/no-custom-color"
		);
	});

	it("blocks literal colors in camel-case style properties", () => {
		const violations = findPolicyViolations(
			"apps/dashboard/app/example.tsx",
			'export const style = { backgroundColor: "#ffffff", borderColor: "rgba(0, 0, 0, 0.2)" };'
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

	it("blocks scratch database ports in tests", () => {
		const violations = findPolicyViolations(
			"packages/services/src/example.integration.test.ts",
			// policy-ignore tests/no-scratch-infra: fixture exercising the rule itself
			'const databaseUrl = "postgresql://postgres:synthetic@localhost:16553/scratch";'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"tests/no-scratch-infra"
		);
	});

	it("blocks ephemeral container ports in tests", () => {
		const violations = findPolicyViolations(
			"packages/services/src/example.integration.test.ts",
			// policy-ignore tests/no-scratch-infra: fixture exercising the rule itself
			'const clickhouse = new URL("http://127.0.0.1:54321/");'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"tests/no-scratch-infra"
		);
	});

	it("allows the shared test services in tests", () => {
		expect(
			findPolicyViolations(
				"packages/services/src/example.integration.test.ts",
				'process.env.REDIS_URL ??= "redis://localhost:6379";\nconst clickhouse = "http://default:@localhost:8123";'
			)
		).toEqual([]);
	});

	it("blocks vitest imports in bun test packages", () => {
		const violations = findPolicyViolations(
			"packages/ai/src/example.test.ts",
			'import { describe, it } from "vitest";'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"tests/wrong-runner-import"
		);
	});

	it("blocks bun:test imports in vitest packages", () => {
		const violations = findPolicyViolations(
			"apps/api/src/routes/example.test.ts",
			'import { describe, it } from "bun:test";'
		);

		expect(violations.map((violation) => violation.rule)).toContain(
			"tests/wrong-runner-import"
		);
	});

	it("leaves product policies out of test files", () => {
		expect(
			findPolicyViolations(
				"apps/api/src/routes/example.test.ts",
				'import { it } from "vitest";\nResponse.json({ error: "Not found" }, { status: 404 });'
			)
		).toEqual([]);
	});

	it("requires a test script for packages that contain unit tests", () => {
		const violations = findTestWiringViolations([
			{
				manifest: "packages/example/package.json",
				scripts: { "check-types": "tsc --noEmit" },
				testFiles: ["packages/example/src/index.test.ts"],
			},
		]);

		expect(violations.map((violation) => violation.rule)).toEqual([
			"tests/unreachable-test-file",
		]);
	});

	it("blocks test scripts that reference missing files", () => {
		const violations = findTestWiringViolations([
			{
				manifest: "packages/example/package.json",
				scripts: {
					test: "bun test src/present.test.ts src/missing.test.ts src/lib/*.test.ts",
				},
				testFiles: ["packages/example/src/present.test.ts"],
			},
		]);

		expect(violations.map((violation) => violation.message)).toEqual([
			'Script "test" references src/missing.test.ts, which does not exist.',
		]);
	});

	it("flags test files outside the paths a test script enumerates", () => {
		const violations = findTestWiringViolations([
			{
				manifest: "packages/example/package.json",
				scripts: { test: "bun test --isolate src/routers src/utils/*.test.ts" },
				testFiles: [
					"packages/example/src/routers/a.test.ts",
					"packages/example/src/utils/b.test.ts",
					"packages/example/src/services/c.test.ts",
				],
			},
		]);

		expect(violations.map((violation) => violation.message)).toEqual([
			"1 test file(s) are not run by any script in this package: src/services/c.test.ts. Add them to a test script.",
		]);
	});

	it("honors ignore patterns and explicit integration chains", () => {
		const scripts = {
			test: "bun test src --path-ignore-patterns='**/*.integration.test.ts'",
			"test:integration":
				"FLAG=true bun test src/a.integration.test.ts && FLAG=true bun test src/b.integration.test.ts",
		};

		expect(
			findTestWiringViolations([
				{
					manifest: "apps/example/package.json",
					scripts,
					testFiles: [
						"apps/example/src/a.integration.test.ts",
						"apps/example/src/b.integration.test.ts",
						"apps/example/src/unit.test.ts",
					],
				},
			])
		).toEqual([]);

		const violations = findTestWiringViolations([
			{
				manifest: "apps/example/package.json",
				scripts,
				testFiles: [
					"apps/example/src/a.integration.test.ts",
					"apps/example/src/orphan.integration.test.ts",
				],
			},
		]);

		expect(violations.map((violation) => violation.message)).toEqual([
			'Script "test:integration" references src/b.integration.test.ts, which does not exist.',
			"1 test file(s) are not run by any script in this package: src/orphan.integration.test.ts. Add them to a test script.",
		]);
	});

	it("treats runner invocations without paths as covering the package", () => {
		expect(
			findTestWiringViolations([
				{
					manifest: "apps/vitest/package.json",
					scripts: { test: "TZ=UTC bunx --bun vitest run" },
					testFiles: ["apps/vitest/src/routes/a.test.ts"],
				},
				{
					manifest: "apps/dashboard/package.json",
					scripts: { test: "bun test --path-ignore-patterns='test/e2e/**' ." },
					testFiles: [
						"apps/dashboard/lib/a.test.ts",
						"apps/dashboard/test/e2e/specs/flow.spec.ts",
					],
				},
				{
					manifest: "packages/redis/package.json",
					scripts: { test: "bun test --max-concurrency=1 *.test.ts" },
					testFiles: ["packages/redis/cacheable.test.ts"],
				},
			])
		).toEqual([]);
	});

	it("accepts wired packages, root scripts, and spec-only packages", () => {
		expect(
			findTestWiringViolations([
				{
					manifest: "package.json",
					scripts: { "lint:policies": "bun test scripts/lint-policy.test.ts" },
					testFiles: ["scripts/lint-policy.test.ts"],
				},
				{
					manifest: "packages/example/package.json",
					scripts: { test: "bun test src" },
					testFiles: ["packages/example/src/index.test.ts"],
				},
				{
					manifest: "packages/browser/package.json",
					scripts: {},
					testFiles: ["packages/browser/tests/flow.spec.ts"],
				},
			])
		).toEqual([]);
	});
});
