import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
	/(?:^|\s)(?:[\w-]+:)*(?:accent|bg|border(?:-[trblxy])?|caret|decoration|divide|fill|from|outline|ring|shadow|stroke|text|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d{1,3})?(?=\s|$)/u;
const ARBITRARY_COLOR_UTILITY =
	/(?:^|\s)(?:[\w-]+:)*(?:accent|bg|border(?:-[trblxy])?|caret|decoration|divide|fill|from|outline|ring|shadow|stroke|text|to|via)-\[[^\]]*(?:#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch)\()[^\]]*\]/iu;
const RAW_COLOR_VALUE = /#[\da-f]{3,8}\b|(?:rgba?|hsla?|oklch)\(/iu;
const DASHBOARD_SOURCE_EXTENSION = /\.(?:css|ts|tsx)$/u;
const HTTP_SOURCE_EXTENSION = /\.(?:ts|tsx)$/u;
const NEWLINE = /\r?\n/u;
const DIFF_HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u;

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

	const sourceFile = ts.createSourceFile(
		path,
		text,
		ts.ScriptTarget.Latest,
		true,
		path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
	const violations: PolicyViolation[] = [];

	const report = (node: ts.Node, rule: RuleId, message: string) => {
		if (!hasPolicyIgnore(sourceFile, node, rule)) {
			const location = sourceFile.getLineAndCharacterOfPosition(
				node.getStart()
			);
			const endLocation = sourceFile.getLineAndCharacterOfPosition(
				node.getEnd()
			);
			violations.push({
				column: location.character + 1,
				endLine: endLocation.line + 1,
				line: location.line + 1,
				message,
				path,
				rule,
			});
		}
	};

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

			if (
				(ts.isStringLiteral(node) ||
					ts.isNoSubstitutionTemplateLiteral(node)) &&
				isCustomColor(node.text)
			) {
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
	if (path.endsWith(".test.ts") || path.endsWith(".spec.ts")) {
		return false;
	}
	if (path.endsWith(".test.tsx") || path.endsWith(".spec.tsx")) {
		return false;
	}

	return (
		(isDashboardSource(path) && DASHBOARD_SOURCE_EXTENSION.test(path)) ||
		(isHttpSource(path) && HTTP_SOURCE_EXTENSION.test(path))
	);
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

function isCustomColor(value: string) {
	return (
		TAILWIND_PALETTE_UTILITY.test(value) ||
		ARBITRARY_COLOR_UTILITY.test(value) ||
		RAW_COLOR_VALUE.test(value)
	);
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

function objectHasErrorProperty(node: ts.Node | undefined) {
	if (!(node && ts.isObjectLiteralExpression(node))) {
		return false;
	}

	return node.properties.some((property) => {
		if (
			!(
				ts.isPropertyAssignment(property) ||
				ts.isShorthandPropertyAssignment(property)
			)
		) {
			return false;
		}
		return property.name.getText() === "error";
	});
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
	const diff = runGit([
		"diff",
		"--unified=0",
		"--no-ext-diff",
		POLICY_ROLLOUT_BASE,
	]);
	const changedLines = parseChangedLines(diff);
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
	try {
		return execFileSync("git", args, {
			cwd: process.cwd(),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch {
		throw new Error(
			`Policy lint needs the ${POLICY_ROLLOUT_BASE} rollout commit. Fetch full git history and retry.`
		);
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

function main() {
	const changedLines = getChangedLines();
	const violations = [...changedLines.keys()].flatMap((path) => {
		const text = readFileSync(resolve(path), "utf8");
		return findPolicyViolations(path, text).filter((violation) =>
			intersectsChangedLines(violation, changedLines)
		);
	});

	if (violations.length === 0) {
		return;
	}

	console.error(violations.map(formatViolation).join("\n\n"));
	process.exitCode = 1;
}

if (import.meta.main) {
	main();
}
