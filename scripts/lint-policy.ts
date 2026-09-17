import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

/**
 * Existing code is intentionally grandfathered from the commit immediately
 * before this policy shipped. Every changed line after this point is checked.
 * Keeping the rollout boundary in code makes new violations fail without
 * requiring a noisy, hand-maintained list of legacy exceptions.
 */
const POLICY_ROLLOUT_BASE = "941dc1344";

const RULE = {
	noCustomJsonErrorResponse: "http/no-custom-json-error-response",
	noRawInteractiveHtml: "dashboard/no-raw-interactive-html",
	noCustomColor: "dashboard/no-custom-color",
	noScratchTestInfra: "tests/no-scratch-infra",
	wrongTestRunner: "tests/wrong-runner-import",
	unreachableTest: "tests/unreachable-test-file",
} as const;

type RuleId = (typeof RULE)[keyof typeof RULE];

export interface PolicyViolation {
	column: number;
	endLine: number;
	line: number;
	message: string;
	path: string;
	rule: RuleId;
}

export interface TestWiringPackage {
	manifest: string;
	scripts: Record<string, string>;
	testFiles: string[];
}

const VITEST_PACKAGE_PATHS = ["apps/api/", "apps/basket/"];
const TEST_SOURCE_EXTENSION = /\.(?:test|spec)\.tsx?$/u;
const UNIT_TEST_EXTENSION = /\.test\.tsx?$/u;
const SCRATCH_LOOPBACK_PORT = /(?:localhost|127\.0\.0\.1):1\d{4}\b/u;
const SCRIPT_TOKEN_SEPARATOR = /\s+/u;

const NATIVE_INTERACTIVE_TAGS = new Set([
	"button",
	"dialog",
	"input",
	"select",
	"textarea",
]);

const COMPONENT_IMPLEMENTATION_PATHS = [
	"apps/dashboard/components/ds/",
	"apps/dashboard/components/ui/",
];

const APPROVED_ERROR_RESPONSE_PATHS = new Set([
	"apps/api/src/http/errors.ts",
	"apps/basket/src/index.ts",
	"apps/basket/src/lib/structured-errors.ts",
	"packages/shared/src/http-error-response.ts",
]);

const TAILWIND_PALETTE_UTILITY =
	/(?:^|\s)(?:[\w-]+:)*(?:accent|bg|border(?:-[trblxy])?|caret|decoration|divide|fill|from|outline|ring|shadow|stroke|text|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?!?(?=\s|$)/u;
const ARBITRARY_COLOR_UTILITY =
	/(?:^|\s)(?:[\w-]+:)*(?:accent|bg|border(?:-[trblxy])?|caret|decoration|divide|fill|from|outline|ring|shadow|stroke|text|to|via)-\[[^\]]*(?:#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch)\()[^\]]*\]!?/iu;
const RAW_COLOR_VALUE = /#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch)\(/iu;
const COLORISH_IDENTIFIER =
	/(?:^|[_-])(?:color|background|border|fill|stroke|shadow)(?:$|[_-])/iu;
const DASHBOARD_SOURCE_EXTENSION = /\.(?:css|ts|tsx)$/u;
const HTTP_SOURCE_EXTENSION = /\.(?:ts|tsx)$/u;
const NEWLINE = /\r?\n/u;
const DIFF_HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u;
const STAGED = process.argv.includes("--staged");

export function findPolicyViolations(
	path: string,
	text: string
): PolicyViolation[] {
	if (!isPolicySource(path)) {
		return [];
	}

	if (path.endsWith(".css")) {
		return findCustomCssColors(path, text);
	}

	const sourceFile = parseSource(path, text);
	const violations: PolicyViolation[] = [];
	const report = (node: ts.Node, rule: RuleId, message: string) =>
		reportNode(sourceFile, violations, node, rule, message);

	if (isTestSource(path)) {
		const visitTest = (node: ts.Node) => {
			if (isScratchLoopbackLiteral(node)) {
				report(
					node,
					RULE.noScratchTestInfra,
					"Tests must use the shared services from @databuddy/test/env (Postgres 5432, Redis 6379, ClickHouse 8123), never a scratch database port."
				);
			}
			if (ts.isImportDeclaration(node)) {
				const runnerMessage = wrongTestRunnerMessage(path, node);
				if (runnerMessage) {
					report(node, RULE.wrongTestRunner, runnerMessage);
				}
			}
			ts.forEachChild(node, visitTest);
		};
		visitTest(sourceFile);
		return violations;
	}

	const visit = (node: ts.Node) => {
		if (isDashboardFeatureSource(path)) {
			if (
				(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
				NATIVE_INTERACTIVE_TAGS.has(node.tagName.getText(sourceFile))
			) {
				report(
					node,
					RULE.noRawInteractiveHtml,
					"Use a component from @databuddy/ui instead of a native interactive element."
				);
			}

			if (ts.isImportDeclaration(node) && isDirectPrimitiveImport(node)) {
				report(
					node,
					RULE.noRawInteractiveHtml,
					"Import interactive primitives through @databuddy/ui, not Radix or Base UI directly."
				);
			}

			if (isCustomColorNode(node)) {
				report(
					node,
					RULE.noCustomColor,
					"Use a semantic design token instead of a Tailwind palette or custom color value."
				);
			}
		}

		if (
			isHttpSource(path) &&
			!APPROVED_ERROR_RESPONSE_PATHS.has(path) &&
			isCustomJsonErrorResponse(node)
		) {
			report(
				node,
				RULE.noCustomJsonErrorResponse,
				"Use the service's shared error handler or error catalog instead of returning a JSON error payload."
			);
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return violations;
}

function isPolicySource(path: string) {
	if (isTestSource(path)) {
		return true;
	}

	return (
		(isDashboardSource(path) && DASHBOARD_SOURCE_EXTENSION.test(path)) ||
		(isHttpSource(path) && HTTP_SOURCE_EXTENSION.test(path))
	);
}

function isTestSource(path: string) {
	return TEST_SOURCE_EXTENSION.test(path);
}

function parseSource(path: string, text: string) {
	return ts.createSourceFile(
		path,
		text,
		ts.ScriptTarget.Latest,
		true,
		path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
}

function reportNode(
	sourceFile: ts.SourceFile,
	violations: PolicyViolation[],
	node: ts.Node,
	rule: RuleId,
	message: string
) {
	if (hasPolicyIgnore(sourceFile, node, rule)) {
		return;
	}
	const location = sourceFile.getLineAndCharacterOfPosition(node.getStart());
	const endLocation = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
	violations.push({
		column: location.character + 1,
		endLine: endLocation.line + 1,
		line: location.line + 1,
		message,
		path: sourceFile.fileName,
		rule,
	});
}

function isScratchLoopbackLiteral(node: ts.Node) {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return SCRATCH_LOOPBACK_PORT.test(node.text);
	}
	if (ts.isTemplateExpression(node)) {
		return [
			node.head.text,
			...node.templateSpans.map((span) => span.literal.text),
		].some((text) => SCRATCH_LOOPBACK_PORT.test(text));
	}
	return false;
}

function usesVitest(path: string) {
	return VITEST_PACKAGE_PATHS.some((prefix) => path.startsWith(prefix));
}

function wrongTestRunnerMessage(path: string, node: ts.ImportDeclaration) {
	if (!ts.isStringLiteral(node.moduleSpecifier)) {
		return;
	}
	const moduleName = node.moduleSpecifier.text;
	if (moduleName === "vitest" && !usesVitest(path)) {
		return "This package runs bun test; import test helpers from bun:test.";
	}
	if (moduleName === "bun:test" && usesVitest(path)) {
		return "This package runs vitest; import test helpers from vitest.";
	}
}

export function findTestWiringViolations(
	packages: TestWiringPackage[]
): PolicyViolation[] {
	return packages.flatMap((pkg) => {
		const violations: PolicyViolation[] = [];
		const report = (message: string) =>
			violations.push({
				column: 1,
				endLine: 1,
				line: 1,
				message,
				path: pkg.manifest,
				rule: RULE.unreachableTest,
			});
		const packageDir = dirname(pkg.manifest);
		const scriptFile = (token: string) =>
			packageDir === "." ? token : join(packageDir, token);
		const referenced = new Set<string>();
		for (const [name, script] of Object.entries(pkg.scripts)) {
			for (const token of script.split(SCRIPT_TOKEN_SEPARATOR)) {
				if (token.includes("*") || !TEST_SOURCE_EXTENSION.test(token)) {
					continue;
				}
				const file = scriptFile(token);
				referenced.add(file);
				if (!pkg.testFiles.includes(file)) {
					report(`Script "${name}" references ${token}, which does not exist.`);
				}
			}
		}
		const unreachable = pkg.scripts.test
			? []
			: pkg.testFiles.filter(
					(file) => UNIT_TEST_EXTENSION.test(file) && !referenced.has(file)
				);
		if (unreachable.length > 0) {
			report(
				`Add a "test" script; ${unreachable.length} test file(s) under this package never run (first: ${unreachable[0]}).`
			);
		}
		return violations;
	});
}

function collectTestWiringPackages(): TestWiringPackage[] {
	const manifests = runGit([
		"ls-files",
		"package.json",
		"apps/*/package.json",
		"packages/*/package.json",
	])
		.split("\n")
		.filter(Boolean)
		.sort((a, b) => b.length - a.length);
	const testFiles = [
		...runGit([
			"ls-files",
			"*.test.ts",
			"*.test.tsx",
			"*.spec.ts",
			"*.spec.tsx",
		]).split("\n"),
		...runGit(["ls-files", "--others", "--exclude-standard"]).split("\n"),
	].filter((file) => file && isTestSource(file) && existsSync(resolve(file)));
	const packages = manifests.map((manifest) => ({
		manifest,
		scripts:
			(
				JSON.parse(readFileSync(resolve(manifest), "utf8")) as {
					scripts?: Record<string, string>;
				}
			).scripts ?? {},
		testFiles: [] as string[],
	}));
	for (const file of testFiles) {
		const owner = packages.find((pkg) => {
			const dir = dirname(pkg.manifest);
			return dir === "." || file.startsWith(`${dir}/`);
		});
		owner?.testFiles.push(file);
	}
	return packages;
}

function isDashboardSource(path: string) {
	return path.startsWith("apps/dashboard/");
}

function isDashboardFeatureSource(path: string) {
	return (
		path.startsWith("apps/dashboard/") &&
		path.endsWith(".tsx") &&
		!COMPONENT_IMPLEMENTATION_PATHS.some((prefix) => path.startsWith(prefix))
	);
}

function isHttpSource(path: string) {
	return ["apps/api/", "apps/basket/", "apps/links/", "apps/uptime/"].some(
		(prefix) => path.startsWith(prefix)
	);
}

function isDirectPrimitiveImport(node: ts.ImportDeclaration) {
	if (!ts.isStringLiteral(node.moduleSpecifier)) {
		return false;
	}

	const moduleName = node.moduleSpecifier.text;
	return (
		moduleName === "radix-ui" ||
		moduleName.startsWith("@base-ui-components/") ||
		moduleName.startsWith("@radix-ui/")
	);
}

function isCustomColor(value: string, allowRawColor: boolean) {
	return (
		TAILWIND_PALETTE_UTILITY.test(value) ||
		ARBITRARY_COLOR_UTILITY.test(value) ||
		(allowRawColor && RAW_COLOR_VALUE.test(value))
	);
}

function isCustomColorNode(node: ts.Node) {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return isCustomColor(node.text, isRawColorContext(node));
	}
	if (ts.isTemplateExpression(node)) {
		return isCustomColor(
			[
				node.head.text,
				...node.templateSpans.map((span) => span.literal.text),
			].join(" "),
			isRawColorContext(node)
		);
	}
	return false;
}

function isRawColorContext(node: ts.Node) {
	let current = node;
	while (
		current.parent &&
		(ts.isTemplateSpan(current.parent) ||
			ts.isTemplateExpression(current.parent) ||
			ts.isParenthesizedExpression(current.parent) ||
			ts.isJsxExpression(current.parent))
	) {
		current = current.parent;
	}

	if (
		current.parent &&
		ts.isJsxAttribute(current.parent) &&
		ts.isIdentifier(current.parent.name)
	) {
		return ["class", "className", "style"].includes(current.parent.name.text);
	}

	if (
		current.parent &&
		ts.isPropertyAssignment(current.parent) &&
		isColorishName(current.parent.name)
	) {
		return true;
	}

	return (
		current.parent &&
		ts.isVariableDeclaration(current.parent) &&
		ts.isIdentifier(current.parent.name) &&
		isColorishIdentifier(current.parent.name.text)
	);
}

function isColorishName(name: ts.PropertyName) {
	return isColorishIdentifier(propertyNameText(name));
}

function isColorishIdentifier(name: string) {
	const normalized = name.replace(
		/[A-Z]/g,
		(letter) => `_${letter.toLowerCase()}`
	);
	return COLORISH_IDENTIFIER.test(normalized);
}

function isCustomJsonErrorResponse(node: ts.Node) {
	if (ts.isCallExpression(node) && isResponseJsonErrorCall(node)) {
		return true;
	}
	if (ts.isNewExpression(node) && isJsonErrorResponse(node)) {
		return true;
	}
	return ts.isReturnStatement(node) && isElysiaErrorObjectReturn(node);
}

function isResponseJsonErrorCall(node: ts.CallExpression) {
	if (
		!ts.isPropertyAccessExpression(node.expression) ||
		node.expression.expression.getText() !== "Response" ||
		node.expression.name.text !== "json"
	) {
		return false;
	}

	return objectHasErrorProperty(node.arguments[0]);
}

function isJsonErrorResponse(node: ts.NewExpression) {
	if (node.expression.getText() !== "Response") {
		return false;
	}

	const body = node.arguments?.[0];
	return (
		body != null &&
		ts.isCallExpression(body) &&
		isJsonStringifyCall(body) &&
		objectHasErrorProperty(body.arguments[0])
	);
}

function isJsonStringifyCall(node: ts.CallExpression) {
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		node.expression.expression.getText() === "JSON" &&
		node.expression.name.text === "stringify"
	);
}

function isElysiaErrorObjectReturn(node: ts.ReturnStatement) {
	return (
		objectHasErrorProperty(node.expression) &&
		functionAcceptsElysiaSet(node.parent)
	);
}

function functionAcceptsElysiaSet(node: ts.Node | undefined) {
	let current = node;
	while (current) {
		if (isFunctionLike(current)) {
			return current.parameters.some((parameter) => {
				if (ts.isIdentifier(parameter.name)) {
					return parameter.name.text === "set";
				}
				return parameter.name.elements.some(
					(element) =>
						ts.isBindingElement(element) &&
						ts.isIdentifier(element.name) &&
						element.name.text === "set"
				);
			});
		}
		current = current.parent;
	}
	return false;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
	return (
		ts.isArrowFunction(node) ||
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isMethodDeclaration(node)
	);
}

function objectHasErrorProperty(
	node: ts.Node | undefined,
	context: ts.Node = node as ts.Node
) {
	const object = resolveObjectLiteral(node, context);
	if (!object) {
		return false;
	}

	return object.properties.some((property) => {
		if (
			!(
				ts.isPropertyAssignment(property) ||
				ts.isShorthandPropertyAssignment(property)
			)
		) {
			return false;
		}
		return propertyNameText(property.name) === "error";
	});
}

function resolveObjectLiteral(node: ts.Node | undefined, context: ts.Node) {
	if (!node) {
		return;
	}
	if (ts.isObjectLiteralExpression(node)) {
		return node;
	}
	if (ts.isIdentifier(node)) {
		return findPreviousObjectLiteralDeclaration(node.text, context);
	}
}

function findPreviousObjectLiteralDeclaration(name: string, context: ts.Node) {
	let current: ts.Node | undefined = context.parent;
	while (current) {
		if (ts.isBlock(current) || ts.isSourceFile(current)) {
			const found = findObjectLiteralInStatements(
				name,
				current.statements,
				context.getStart()
			);
			if (found) {
				return found;
			}
		}
		current = current.parent;
	}
}

function findObjectLiteralInStatements(
	name: string,
	statements: ts.NodeArray<ts.Statement>,
	beforePosition: number
) {
	for (const statement of statements) {
		if (statement.getStart() >= beforePosition) {
			break;
		}
		if (!ts.isVariableStatement(statement)) {
			continue;
		}
		for (const declaration of statement.declarationList.declarations) {
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === name &&
				declaration.initializer &&
				ts.isObjectLiteralExpression(declaration.initializer)
			) {
				return declaration.initializer;
			}
		}
	}
}

function propertyNameText(name: ts.PropertyName) {
	if (
		ts.isIdentifier(name) ||
		ts.isStringLiteral(name) ||
		ts.isNumericLiteral(name)
	) {
		return name.text;
	}
	return name.getText();
}

function hasPolicyIgnore(
	sourceFile: ts.SourceFile,
	node: ts.Node,
	rule: RuleId
) {
	const location = sourceFile.getLineAndCharacterOfPosition(node.getStart());
	if (location.line === 0) {
		return false;
	}
	const previousLine = sourceFile.text.split(NEWLINE)[location.line - 1];
	const escapedRule = rule.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	const ignorePattern = new RegExp(
		`policy-ignore\\s+${escapedRule}\\s*:\\s*\\S`,
		"u"
	);
	return ignorePattern.test(previousLine);
}

function findCustomCssColors(path: string, text: string): PolicyViolation[] {
	if (
		path === "apps/dashboard/app/globals.css" ||
		COMPONENT_IMPLEMENTATION_PATHS.some((prefix) => path.startsWith(prefix))
	) {
		return [];
	}

	const lines = text.split(NEWLINE);
	return lines.flatMap((line, index) => {
		if (!RAW_COLOR_VALUE.test(line)) {
			return [];
		}
		const rule = RULE.noCustomColor;
		const previousLine = index === 0 ? "" : lines[index - 1];
		const escapedRule = rule.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
		if (
			new RegExp(`policy-ignore\\s+${escapedRule}\\s*:\\s*\\S`, "u").test(
				previousLine
			)
		) {
			return [];
		}
		return [
			{
				column: 1,
				endLine: index + 1,
				line: index + 1,
				message:
					"Use a semantic design token instead of a custom CSS color value.",
				path,
				rule,
			},
		];
	});
}

function getChangedLines() {
	if (STAGED) {
		return getStagedChangedLines();
	}

	const changedLines = parseChangedLines(getRolloutDiff());
	for (const path of runGit(["ls-files", "--others", "--exclude-standard"])
		.split("\n")
		.filter(Boolean)) {
		if (!isPolicySource(path)) {
			continue;
		}
		const lineCount = readFileSync(resolve(path), "utf8").split(NEWLINE).length;
		changedLines.set(
			path,
			new Set(Array.from({ length: lineCount }, (_, i) => i + 1))
		);
	}
	return changedLines;
}

function getRolloutDiff() {
	const diffArgs = [
		"diff",
		"--unified=0",
		"--no-ext-diff",
		POLICY_ROLLOUT_BASE,
	];
	const diff = tryRunGit(diffArgs);
	if (diff !== null) {
		return diff;
	}
	tryRunGit(["fetch", "--depth=1", "origin", POLICY_ROLLOUT_BASE]);
	const fetchedDiff = tryRunGit(diffArgs);
	if (fetchedDiff !== null) {
		return fetchedDiff;
	}

	const workingTreeDiff = tryRunGit(["diff", "--unified=0", "--no-ext-diff"]);
	if (workingTreeDiff !== null) {
		console.warn(
			`Policy lint could not diff against rollout commit ${POLICY_ROLLOUT_BASE}; checking current working-tree changes only.`
		);
		return workingTreeDiff;
	}

	console.warn(
		`Policy lint could not diff against rollout commit ${POLICY_ROLLOUT_BASE}; skipping changed-line policy checks.`
	);
	return "";
}

function getStagedChangedLines() {
	const diff = runGit(["diff", "--cached", "--unified=0", "--no-ext-diff"]);
	return parseChangedLines(diff);
}

function parseChangedLines(diff: string) {
	const changedLines = new Map<string, Set<number>>();
	let path: string | undefined;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ b/")) {
			path = line.slice("+++ b/".length);
			continue;
		}
		const hunk = DIFF_HUNK.exec(line);
		if (!(hunk && path)) {
			continue;
		}
		const start = Number(hunk[1]);
		const count = Number(hunk[2] ?? "1");
		if (count === 0) {
			continue;
		}
		const lines = changedLines.get(path) ?? new Set<number>();
		for (let offset = 0; offset < count; offset += 1) {
			lines.add(start + offset);
		}
		changedLines.set(path, lines);
	}
	return changedLines;
}

function runGit(args: string[]) {
	const output = tryRunGit(args);
	if (output !== null) {
		return output;
	}
	throw new Error(
		`Policy lint could not run git ${args.join(" ")} from ${process.cwd()}.`
	);
}

const GIT_OUTPUT_MAX_BYTES = 512 * 1024 * 1024;

function tryRunGit(args: string[]) {
	try {
		return execFileSync("git", args, {
			cwd: process.cwd(),
			encoding: "utf8",
			maxBuffer: GIT_OUTPUT_MAX_BYTES,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		return null;
	}
}

function intersectsChangedLines(
	node: PolicyViolation,
	changedLines: Map<string, Set<number>>
) {
	const lines = changedLines.get(node.path);
	if (!lines) {
		return false;
	}
	for (let line = node.line; line <= node.endLine; line += 1) {
		if (lines.has(line)) {
			return true;
		}
	}
	return false;
}

function formatViolation(violation: PolicyViolation) {
	return `${violation.path}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}\n  Add // policy-ignore ${violation.rule}: <specific reason> immediately above only when the exception is intentional.`;
}

function readPolicyText(path: string) {
	if (STAGED) {
		const text = tryRunGit(["show", `:${path}`]);
		if (text !== null) {
			return text;
		}
	}
	return readFileSync(resolve(path), "utf8");
}

function main() {
	const changedLines = getChangedLines();
	const violations = [
		...[...changedLines.keys()].flatMap((path) => {
			const text = readPolicyText(path);
			return findPolicyViolations(path, text).filter((violation) =>
				intersectsChangedLines(violation, changedLines)
			);
		}),
		...findTestWiringViolations(collectTestWiringPackages()),
	];

	if (violations.length === 0) {
		return;
	}

	console.error(violations.map(formatViolation).join("\n\n"));
	process.exitCode = 1;
}

if (import.meta.main) {
	main();
}
