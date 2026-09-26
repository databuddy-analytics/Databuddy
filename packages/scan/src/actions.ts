import { posix } from "node:path";
import ts from "typescript";

export interface Site {
	end: number;
	path: string;
	start: number;
}
interface Action {
	commits: boolean;
	end: number;
	excerpts: Site[];
	issues: string[];
	label: string;
	sites: Site[];
	source: string;
	start: number;
	tracked?: string;
}
type FunctionNode =
	| ts.FunctionDeclaration
	| ts.FunctionExpression
	| ts.ArrowFunction
	| ts.MethodDeclaration;
interface Unit {
	bindings: Map<ts.Node, Map<string, ts.Node>>;
	file: ts.SourceFile;
	imports: Map<
		string,
		{ module: string; name: string; node: ts.ImportDeclaration }
	>;
	path: string;
	stateSetters: Set<ts.Node>;
}
interface Reference {
	node: ts.Node;
	unit: Unit;
}
const extension = /\.[cm]?[jt]sx?$/i;
const intent =
	/\b(?:copy|export|download|connect|install|upgrade|checkout|subscribe|sign up|register|start trial|accept invitation)\b/i;
const selections = new Set(["onValueChange", "onCheckedChange", "onSelect"]);
const handlers = new Set([
	"onClick",
	"onSubmit",
	"onCopy",
	"action",
	"formAction",
	"onValueChange",
	"onCheckedChange",
	"onSelect",
]);
const writes = new Set([
	"mutate",
	"mutateAsync",
	"writeText",
	"write",
	"setItem",
	"removeItem",
	"insert",
	"update",
	"delete",
	"create",
	"upsert",
	"createMany",
	"updateMany",
	"deleteMany",
]);
const httpWrites = new Set(["post", "put", "patch"]);
const boundCall = new Set(["bind", "call", "apply"]);
const camelBoundary = /([a-z])([A-Z])/g;
const setupCopy =
	/\b(?:install(?:ation)?|snippet|script|command|cli|config(?:uration)?|setup|sdk|embed|curl|npm|npx|bunx|yarn|pnpm|env|api[\s_-]?key|apikey|key|token|secret|webhook|mcp|code)\b/i;
const readCall =
	/^(?:get|list|find|load|fetch|query|read|refetch|invalidate|prefetch|wait|sleep|delay|resolve|all|allSettled|race)\w*$/i;
const actionVerb =
	/^(?:send|submit|publish|invite|purchase|checkout|attach|upload|export|connect|install|subscribe|sign(?:In|Up|Out)|approve|reject|revoke|rotate|regenerate|generate|trigger|archive|restore|destroy|save|transfer)(?:[A-Z]\w*)?$/;
const downloadSignal = /(?:^|\.)(?:createObjectURL|download)$/;
const readMethod = /^(?:get|head|options)$/i;
const routeMethods = new Set([
	"post",
	"put",
	"patch",
	"delete",
	"get",
	"handler",
]);
const httpMethods = new Set(["POST", "PUT", "PATCH", "DELETE", "GET"]);
const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const contextLimit = 16_000;
const jsxExtension = /x$/i;
const jsExtension = /\.[cm]?js$/i;
const importExtension = /\.[cm]?jsx?$/i;
const routineCall =
	/^(?:(?:event|e|evt)\.(?:preventDefault|stopPropagation)|(?:router|history)\.(?:push|replace|back|refresh)|console\.\w+|[\w$.]*\.classList\.(?:add|remove|toggle|replace)|[\w$.]*\.(?:focus|blur|scrollIntoView|setAttribute|removeAttribute|toggleAttribute|refetch|refetchQueries|invalidateQueries|resetQueries|reset|fetchNextPage|fetchPreviousPage))$/;
const queryHelper =
	/^(?:refetch|refetchQueries|invalidateQueries|resetQueries|reset|fetchNextPage|fetchPreviousPage)$/;
const domListeners = new Set(["addEventListener", "on"]);
const domEvents = new Set(["click", "submit", "copy"]);
const domProperties = new Set(["onclick", "onsubmit", "oncopy"]);
const afterHook = /^after[A-Z]/;
const hookContainer = /^(?:hooks|organizationHooks|databaseHooks)$/;
const trackingCall = /^(?:track|capture|logEvent)/;
const whitespaceRun = /\s+/g;
const pending = /(?:\.\.\.|\u2026)\s*$/;
const formAttributes = new Set(["action", "formAction"]);
const formHook = /^(?:React\.)?use(?:ActionState|FormState)$/;
const mutationCallbacks = new Set([
	"mutationFn",
	"onMutate",
	"onSuccess",
	"onError",
	"onSettled",
]);
const submitHandler = /^(?:onSubmit|action|formAction)$/;
const statePairs = new Set([
	"react:useState",
	"react:useReducer",
	"jotai:useAtom",
	"nuqs:useQueryState",
	"nuqs:useQueryStates",
]);
const stateSetterHooks = new Set(["jotai:useSetAtom"]);
const namedByContent = new Set(["a", "button", "label", "option", "summary"]);
const contentRoles = new Set([
	"button",
	"checkbox",
	"link",
	"menuitem",
	"menuitemcheckbox",
	"menuitemradio",
	"option",
	"radio",
	"switch",
	"tab",
	"treeitem",
]);

function writesOverFetch(
	call: ts.CallExpression,
	owner: { file: ts.SourceFile }
) {
	const init = call.arguments[1];
	if (!(init && ts.isObjectLiteralExpression(init))) {
		return false;
	}
	const method = init.properties.find(
		(property) =>
			ts.isPropertyAssignment(property) &&
			property.name.getText(owner.file) === "method"
	);
	if (!(method && ts.isPropertyAssignment(method))) {
		return false;
	}
	return !(
		ts.isStringLiteralLike(method.initializer) &&
		readMethod.test(method.initializer.text)
	);
}
function forwarded(input: ts.Node): boolean {
	const node = unwrap(input);
	return ts.isIdentifier(node) || (fallback(node) && forwarded(node.left));
}
function hop(target: { node: ts.Node }, depth: number) {
	return forwarded(target.node) ? depth : depth + 1;
}
function fallback(node: ts.Node): node is ts.BinaryExpression {
	return (
		ts.isBinaryExpression(node) &&
		(node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
			node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
	);
}
function callable(node: ts.Node) {
	const value = unwrap(node);
	return isFunction(value) || ts.isIdentifier(value);
}
function brief(node: ts.Node, file: ts.SourceFile) {
	return node.getText(file).replace(whitespaceRun, " ").slice(0, 60);
}
function attributeText(node: ts.Node, file: ts.SourceFile) {
	const element = ts.isJsxElement(node) ? node.openingElement : node;
	return ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)
		? element.attributes.properties
				.map((attribute) => attribute.getText(file))
				.join(" ")
		: "";
}
function walk(node: ts.Node, visit: (node: ts.Node) => void) {
	visit(node);
	ts.forEachChild(node, (child) => walk(child, visit));
}
function isFunction(node: ts.Node): node is FunctionNode {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node)
	);
}
function enclosingFunction(node: ts.Node): FunctionNode | undefined {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (isFunction(parent)) {
			return parent;
		}
	}
}
function scope(node: ts.Node): ts.Node {
	let parent = node.parent;
	while (
		parent &&
		!ts.isBlock(parent) &&
		!isFunction(parent) &&
		!ts.isSourceFile(parent)
	) {
		parent = parent.parent;
	}
	return parent;
}
function unwrap(input: ts.Node): ts.Node {
	let node = input;
	while (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isNonNullExpression(node)
	) {
		node = node.expression;
	}
	return node;
}
function functionValue(input: ts.Node): FunctionNode | undefined {
	const node = unwrap(input);
	if (isFunction(node)) {
		return node;
	}
	if (
		(ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) &&
		node.initializer
	) {
		return functionValue(node.initializer);
	}
	if (
		ts.isCallExpression(node) &&
		["useCallback", "useEvent"].includes(node.expression.getText()) &&
		node.arguments[0]
	) {
		return functionValue(node.arguments[0]);
	}
}
function trackedBy(element: ts.Node, file: ts.SourceFile) {
	for (
		let node: ts.Node | undefined = element;
		node && !isFunction(node) && !ts.isSourceFile(node);
		node = node.parent
	) {
		const opening = ts.isJsxElement(node)
			? node.openingElement
			: ts.isJsxSelfClosingElement(node)
				? node
				: undefined;
		const attribute = opening?.attributes.properties.find(
			(property): property is ts.JsxAttribute =>
				ts.isJsxAttribute(property) &&
				property.name.getText(file) === "data-track"
		);
		if (attribute) {
			return attribute.getText(file);
		}
	}
}
function site(unit: Unit, node: ts.Node): Site {
	return {
		path: unit.path,
		start:
			unit.file.getLineAndCharacterOfPosition(node.getStart(unit.file)).line +
			1,
		end:
			unit.file.getLineAndCharacterOfPosition(
				Math.max(node.getStart(unit.file), node.end - 1)
			).line + 1,
	};
}
function declaration(input: ts.Node): ts.Node {
	let node = input;
	while (ts.isBindingElement(node) || ts.isObjectBindingPattern(node)) {
		node = node.parent;
	}
	return ts.isVariableDeclaration(node) &&
		ts.isVariableDeclarationList(node.parent) &&
		ts.isVariableStatement(node.parent.parent)
		? node.parent.parent
		: node;
}
function lookupBase(unit: Unit, expression: ts.Node): ts.Node {
	const node = unwrap(expression);
	const base = ts.isPropertyAccessExpression(node)
		? unwrap(node.expression)
		: node;
	return (ts.isIdentifier(base) && lookup(unit, base.text, base)) || node;
}
function lookup(unit: Unit, name: string, at: ts.Node): ts.Node | undefined {
	for (let parent: ts.Node | undefined = at; parent; parent = parent.parent) {
		const found = unit.bindings.get(parent)?.get(name);
		if (found) {
			return found;
		}
	}
}

const appRoute = /(?:^|\/)app\/(.+)\/route\.[cm]?[jt]sx?$/;
const pagesRoute = /(?:^|\/)pages\/(api\/.+?)(?:\/index)?\.[cm]?[jt]sx?$/;
const routeGroup = /^\(.*\)$/;
const leadingBase = /^:var(?=\/)/;
const remixRoute = /(?:^|\/)app\/routes\/(.+?)(?:\/route)?\.[cm]?[jt]sx?$/;
const nitroRoute =
	/(?:^|\/)server\/(api|routes)\/(.+?)(?:\.(get|post|put|patch|delete))?\.[cm]?[jt]s$/;
const nitroHandler = /^(?:define(?:Cached)?EventHandler|eventHandler)$/;
const indexSuffix = /\/?index$/;
const svelteKitPage = /(?:^|\/)src\/routes\/?(.*?)\/?\+page\.server\.[jt]s$/;
function exportedDeclaration(node: ts.Node) {
	const statement = ts.isVariableDeclaration(node) ? node.parent.parent : node;
	return !!(
		ts.canHaveModifiers(statement) &&
		ts
			.getModifiers(statement)
			?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
	);
}
const queryOrHash = /[?#]/;
const genericHandler =
	/^(?:on(?:Click|Submit|Select|Change)|handle(?:Click|Submit|Change)|submit|handler|callback|formAction)$/;
const entities: Record<string, string> = {
	"&apos;": "'",
	"&#39;": "'",
	"&quot;": '"',
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&nbsp;": " ",
};
const entity = new RegExp(Object.keys(entities).join("|"), "g");
const routeTables = new WeakMap<
	ReadonlyMap<string, string>,
	{ export: "default" | "method"; parts: string[]; path: string }[]
>();
function routeTable(sources: ReadonlyMap<string, string>) {
	let table = routeTables.get(sources);
	if (!table) {
		table = [];
		for (const path of sources.keys()) {
			const app = appRoute.exec(path);
			const pages = app ? null : pagesRoute.exec(path);
			const route = app?.[1] ?? pages?.[1];
			if (route) {
				table.push({
					path,
					export: app ? "method" : "default",
					parts: route.split("/").filter((part) => !routeGroup.test(part)),
				});
			}
		}
		routeTables.set(sources, table);
	}
	return table;
}
function urlParts(input: ts.Node): (string | null)[] | undefined {
	const node = unwrap(input);
	const text = ts.isStringLiteralLike(node)
		? node.text
		: ts.isTemplateExpression(node)
			? node.head.text +
				node.templateSpans.map((span) => `:var${span.literal.text}`).join("")
			: undefined;
	const pathname = text?.split(queryOrHash)[0]?.replace(leadingBase, "");
	if (!pathname?.startsWith("/")) {
		return;
	}
	return pathname
		.split("/")
		.filter(Boolean)
		.map((part) => (part.includes(":var") ? null : part));
}
const serverRouteCall =
	/\.(get|post|put|patch|delete|all)\(\s*["'`](\/[^"'`]*)["'`]/g;
const serverPrefix = /\b(?:prefix\s*:|basePath\()\s*["'`](\/[^"'`]*)["'`]/g;
const serverFile = /\.[cm]?[jt]s$/;
const serverTables = new WeakMap<
	ReadonlyMap<string, string>,
	{ line: number; method: string; parts: string[]; path: string }[]
>();
function serverTable(sources: ReadonlyMap<string, string>) {
	let table = serverTables.get(sources);
	if (!table) {
		table = [];
		for (const [path, text] of sources) {
			if (!serverFile.test(path)) {
				continue;
			}
			const prefixes = [...text.matchAll(serverPrefix)];
			for (const match of text.matchAll(serverRouteCall)) {
				const prefix =
					prefixes.filter((found) => found.index < match.index).at(-1)?.[1] ??
					"";
				table.push({
					path,
					method: match[1] ?? "",
					line: text.slice(0, match.index).split("\n").length,
					parts: `${prefix}${match[2] ?? ""}`.split("/").filter(Boolean),
				});
			}
		}
		serverTables.set(sources, table);
	}
	return table;
}
function serverMatches(route: string[], url: (string | null)[]) {
	return (
		route.length === url.length &&
		route.every(
			(part, index) =>
				part.startsWith(":") ||
				part.startsWith("{") ||
				part === "*" ||
				url[index] === part
		)
	);
}
function routeMatches(route: string[], url: (string | null)[]) {
	for (const [index, part] of route.entries()) {
		if (part.startsWith("[...") || part.startsWith("[[...")) {
			return url.length > index || part.startsWith("[[");
		}
		const piece = url[index];
		if (piece === undefined || !(part.startsWith("[") || piece === part)) {
			return false;
		}
	}
	return route.length === url.length;
}

const markup = /\.(?:html?|vue|svelte|astro)$/i;
const braced = "\\{(?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*\\}";
const openingTag = new RegExp(
	`<([A-Za-z][\\w-]*)((?:\\s+[^\\s"'{}>=/]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|${braced}|[^\\s>"']+))?)*)\\s*/?>([^<]*)`,
	"g"
);
const handlerAttribute = new RegExp(
	`\\s(?:on:?|@|v-on:)(click|submit|copy)(?:[.|][\\w.|]+)?\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(${braced}))`,
	"gi"
);
const translation = /\{\{?\s*\$?t[ce]?\(\s*["'`]([^"'`]+)["'`][^}]*\}\}?/g;
const interpolation = /\{\{[\s\S]*?\}\}|\{[^{}]*\}/g;
const boundLabel =
	/\s:(label|aria-label|title|text)\s*=\s*["']\s*\$?t[ce]?\(\s*[`'"]([^`'"]+)[`'"][^"']*["']/gi;
const scriptBlock = /(<script\b[^>]*>)([\s\S]*?)<\/script\b[^>]*>/gi;
const scriptType = /\stype\s*=\s*["']?([^"'\s>]+)/i;
const executableType =
	/^(?:module|(?:text|application)\/(?:javascript|ecmascript|typescript|babel)|text\/jsx)$/i;
const markupAttribute =
	/\s(data-track|label|aria-label|title|role|type)\s*=\s*("[^"]*"|'[^']*'|\{[^{}]*\})/gi;
const kebabPart = /(?:^|-)([a-z])/g;
const formTag = /form$/i;
const submitButton =
	/<[\w-]*button\b([^>]*\btype\s*=\s*["']submit["'][^>]*)>([^<]*)/i;
const markupLabel = /\blabel\s*=\s*["']([^"']+)["']/i;
const reference = /^[\w$.]+$/;
const navigation = /(?:^|\.)(?:location|href)$/;
const classicScript = /\.c?js$/i;
const moduleSyntax = /^[ \t]*(?:import|export)\b/m;
const topLevelName =
	/^(?:(?:async[ \t]+)?function[ \t]*\*?[ \t]*([\w$]+)|(?:const|let|var)[ \t]+([\w$]+)[ \t]*=)/gm;
const lineBreak = /\r?\n/g;
function decode(text: string) {
	return text.replace(entity, (match) => entities[match] ?? match);
}
function markupSource(text: string, scripts: boolean) {
	const lineOf = (index: number) => text.slice(0, index).split("\n").length - 1;
	const lines = text.split("\n").map(() => "");
	if (scripts) {
		for (const match of text.matchAll(scriptBlock)) {
			const type = scriptType.exec(match[1] ?? "")?.[1];
			if (type && !executableType.test(type)) {
				continue;
			}
			const first = lineOf(match.index + (match[1]?.length ?? 0));
			for (const [offset, line] of (match[2] ?? "").split("\n").entries()) {
				lines[first + offset] = line;
			}
		}
	}
	for (const match of text.matchAll(openingTag)) {
		const [, tag = "", attributes = "", label = ""] = match;
		const events = new Map<string, string>();
		for (const attribute of attributes.matchAll(handlerAttribute)) {
			const event = attribute[1]?.toLowerCase() ?? "";
			const braces = attribute[4];
			const body = decode(
				braces ? braces.slice(1, -1) : (attribute[2] ?? attribute[3] ?? "")
			)
				.replace(lineBreak, " ")
				.trim();
			if (!events.has(event)) {
				events.set(
					event,
					braces || reference.test(body) ? body : `() => {${body}}`
				);
			}
		}
		if (!events.size) {
			continue;
		}
		const element = tag.includes("-")
			? tag.replace(kebabPart, (_, first: string) => first.toUpperCase())
			: tag;
		let name = decode(label)
			.replace(translation, "$1")
			.replace(interpolation, "")
			.trim();
		if (!name && formTag.test(tag)) {
			const body = text.slice(match.index + match[0].length);
			const close = body.search(new RegExp(`</${tag}\\s*>`));
			const submit = submitButton.exec(close < 0 ? body : body.slice(0, close));
			name =
				(submit && markupLabel.exec(submit[1] ?? "")?.[1]) ??
				decode(submit?.[2] ?? "").trim();
		}
		const kept = [
			...[...attributes.matchAll(markupAttribute)].map(
				(attribute) => ` ${attribute[1]}=${attribute[2]}`
			),
			...[...attributes.matchAll(boundLabel)].map(
				(attribute) =>
					` ${attribute[1]?.toLowerCase() === "text" ? "label" : attribute[1]}=${JSON.stringify(attribute[2])}`
			),
		].join("");
		const handlers = [...events]
			.map(
				([event, handler]) =>
					` on${event[0]?.toUpperCase()}${event.slice(1)}={${handler}}`
			)
			.join("");
		lines[lineOf(match.index)] +=
			`;<${element}${kept}${handlers}>{${JSON.stringify(name)}}</${element}>;`;
	}
	return lines.join("\n");
}
const scriptIndexes = new WeakMap<
	ReadonlyMap<string, string>,
	Map<string, string[]>
>();
function scriptFunctions(sources: ReadonlyMap<string, string>) {
	let index = scriptIndexes.get(sources);
	if (!index) {
		index = new Map();
		for (const [path, text] of sources) {
			if (!classicScript.test(path) || moduleSyntax.test(text)) {
				continue;
			}
			for (const match of text.matchAll(topLevelName)) {
				const name = match[1] ?? match[2];
				if (name) {
					index.set(name, [...(index.get(name) ?? []), path]);
				}
			}
		}
		scriptIndexes.set(sources, index);
	}
	return index;
}

const python = /\.py$/i;
const pythonDecorator = /^\s*@/;
const pythonFunction = /^(\s*)(?:async\s+)?def\s+\w+/;
const pythonSignatureEnd = /\)\s*(?:->[^:]*)?:/;
const pythonNoise = /(["'])(?:\\.|(?!\1).)*\1|#.*/g;
const pythonMethod = /^@[\w.]+\.(post|put|patch|delete)\s*\(/i;
const pythonMethodList =
	/^@(?:[\w.]+\.(?:route|api_route)|(?:[\w.]+\.)?(?:api_view|require_http_methods))\s*\(/;
const pythonWriteMethod = /["'](POST|PUT|PATCH|DELETE)["']/i;
const pythonRequirePost = /^@(?:[\w.]+\.)?require_POST\b/;
const pythonPath = /\(\s*(?:(?:path|rule)\s*=\s*)?["'](\/[^"']*)["']/;
function depthOf(line: string) {
	let depth = 0;
	for (const character of line.replace(pythonNoise, "")) {
		if ("([{".includes(character)) {
			depth++;
		} else if (")]}".includes(character)) {
			depth--;
		}
	}
	return depth;
}
function pythonRoute(decorator: string) {
	const method =
		pythonMethod.exec(decorator)?.[1] ??
		(pythonMethodList.test(decorator)
			? pythonWriteMethod.exec(decorator)?.[1]
			: undefined) ??
		(pythonRequirePost.test(decorator) ? "POST" : undefined);
	if (!method) {
		return;
	}
	const route = pythonPath.exec(decorator)?.[1];
	return `${method.toUpperCase()}${route ? ` ${route.slice(0, 120)}` : ""}`;
}
function pythonActions(path: string, source: string): Action[] {
	const lines = source.split("\n");
	const actions: Action[] = [];
	let decorators: string[] = [],
		first = 0;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		if (pythonDecorator.test(line)) {
			if (!decorators.length) {
				first = index;
			}
			let decorator = line.trim(),
				depth = depthOf(line);
			while (depth > 0 && index + 1 < lines.length) {
				index++;
				decorator += ` ${lines[index]?.trim() ?? ""}`;
				depth += depthOf(lines[index] ?? "");
			}
			decorators.push(decorator);
			continue;
		}
		const definition = pythonFunction.exec(line);
		const label = definition && decorators.map(pythonRoute).find(Boolean);
		if (definition && label) {
			const indent = definition[1]?.length ?? 0;
			let end = index,
				depth = 0;
			for (; end < lines.length; end++) {
				const signature = lines[end] ?? "";
				depth += depthOf(signature);
				if (depth <= 0 && pythonSignatureEnd.test(signature)) {
					break;
				}
			}
			for (let next = end + 1; next < lines.length; next++) {
				const body = lines[next] ?? "";
				if (body.trim()) {
					if (body.length - body.trimStart().length <= indent) {
						break;
					}
					end = next;
				}
			}
			const location = { path, start: first + 1, end: end + 1 };
			const text = `# ${path}:${location.start}-${location.end}\n${lines.slice(first, end + 1).join("\n")}`;
			actions.push({
				...location,
				label,
				commits: true,
				source: text.slice(0, contextLimit),
				sites: [location],
				excerpts: [location],
				issues:
					text.length > contextLimit
						? [`truncated_context:${path}:${location.start}`]
						: [],
			});
			index = end;
		}
		if (line.trim() && !line.trimStart().startsWith("#")) {
			decorators = [];
		}
	}
	return actions;
}

export function groupActions(
	path: string,
	source: string,
	sources: ReadonlyMap<string, string>,
	workspace: ReadonlySet<string> = new Set()
): Action[] | null {
	if (python.test(path)) {
		return pythonActions(path, source);
	}
	const units = new Map<string, Unit | null>();
	function parse(key: string, text: string): Unit | null {
		if (units.has(key)) {
			return units.get(key) ?? null;
		}
		const page = markup.test(key);
		if (!(extension.test(key) || page)) {
			return null;
		}
		const kind =
			page || jsxExtension.test(key)
				? ts.ScriptKind.TSX
				: jsExtension.test(key)
					? ts.ScriptKind.JS
					: ts.ScriptKind.TS;
		const file = (
			page ? [markupSource(text, true), markupSource(text, false)] : [text]
		)
			.map((variant) =>
				ts.createSourceFile(key, variant, ts.ScriptTarget.Latest, true, kind)
			)
			.find(
				(candidate) =>
					// createSourceFile populates parseDiagnostics, omitted from TS's public SourceFile type.
					!(
						candidate as ts.SourceFile & {
							parseDiagnostics: readonly ts.Diagnostic[];
						}
					).parseDiagnostics.length
			);
		if (!file) {
			units.set(key, null);
			return null;
		}
		const unit: Unit = {
			path: key,
			file,
			bindings: new Map(),
			imports: new Map(),
			stateSetters: new Set(),
		};
		const hookBindings: {
			setter: ts.Node;
			call: ts.CallExpression;
		}[] = [];
		const bind = (owner: ts.Node, name: string, node: ts.Node) => {
			if (!unit.bindings.has(owner)) {
				unit.bindings.set(owner, new Map());
			}
			unit.bindings.get(owner)?.set(name, node);
		};
		walk(file, (node) => {
			if (
				ts.isVariableDeclaration(node) &&
				ts.isArrayBindingPattern(node.name)
			) {
				for (const binding of node.name.elements) {
					if (ts.isBindingElement(binding) && ts.isIdentifier(binding.name)) {
						bind(scope(node), binding.name.text, binding);
					}
				}
				const setter = node.name.elements[1];
				if (
					setter &&
					ts.isBindingElement(setter) &&
					node.initializer &&
					ts.isCallExpression(node.initializer)
				) {
					hookBindings.push({ setter, call: node.initializer });
				}
			}
			if (
				(ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
				node.name &&
				ts.isIdentifier(node.name)
			) {
				bind(scope(node), node.name.text, node);
			}
			if (
				ts.isVariableDeclaration(node) &&
				ts.isIdentifier(node.name) &&
				node.initializer &&
				ts.isCallExpression(node.initializer)
			) {
				hookBindings.push({ setter: node, call: node.initializer });
			}
			if (
				ts.isVariableDeclaration(node) &&
				ts.isObjectBindingPattern(node.name)
			) {
				for (const binding of node.name.elements) {
					if (ts.isIdentifier(binding.name)) {
						bind(scope(node), binding.name.text, binding);
					}
				}
			}
			if (isFunction(node)) {
				for (const parameter of node.parameters) {
					walk(parameter.name, (part) => {
						if (ts.isIdentifier(part)) {
							bind(node, part.text, parameter);
						}
					});
				}
			}
			if (
				ts.isImportDeclaration(node) &&
				ts.isStringLiteral(node.moduleSpecifier) &&
				node.importClause &&
				!node.importClause.isTypeOnly
			) {
				const module = node.moduleSpecifier.text,
					clause = node.importClause;
				if (clause.name) {
					unit.imports.set(clause.name.text, { module, name: "default", node });
				}
				if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
					for (const item of clause.namedBindings.elements) {
						if (!item.isTypeOnly) {
							unit.imports.set(item.name.text, {
								module,
								name: item.propertyName?.text ?? item.name.text,
								node,
							});
						}
					}
				}
			}
		});
		for (const { setter, call } of hookBindings) {
			if (ts.isIdentifier(call.expression)) {
				const imported = unit.imports.get(call.expression.text);
				if (
					!lookup(unit, call.expression.text, call) &&
					imported &&
					(ts.isBindingElement(setter) ? statePairs : stateSetterHooks).has(
						`${imported.module}:${imported.name}`
					)
				) {
					unit.stateSetters.add(setter);
				}
			}
		}
		units.set(key, unit);
		return unit;
	}
	const unit = parse(path, source);
	if (!unit) {
		return null;
	}
	function moduleFile(
		importer: Unit,
		specifier: string,
		issues: Set<string>
	): Unit | undefined {
		const bases = specifier.startsWith(".")
			? [posix.normalize(posix.join(posix.dirname(importer.path), specifier))]
			: [specifier];
		const moduleParts = specifier.split("/");
		const packageName =
			specifier.startsWith("@") && moduleParts.length === 2
				? moduleParts[1]
				: moduleParts.length === 1
					? moduleParts[0]
					: undefined;
		if (packageName && !sources.has(specifier)) {
			const candidates: string[] = [];
			for (const candidate of sources.keys()) {
				if (
					candidate.endsWith(`/packages/${packageName}/src/index.ts`) ||
					candidate === `packages/${packageName}/src/index.ts`
				) {
					candidates.push(candidate);
				}
			}
			if (candidates.length > 1) {
				issues.add(`ambiguous_import:${specifier}`);
				return;
			}
			bases.push(...candidates);
		}
		if (specifier.startsWith("@/")) {
			for (
				let directory = posix.dirname(importer.path);
				;
				directory = posix.dirname(directory)
			) {
				bases.push(
					posix.join(directory, specifier.slice(2)),
					posix.join(directory, "src", specifier.slice(2))
				);
				if (directory === "." || directory === "/") {
					break;
				}
			}
		}
		for (const base of bases) {
			const stem = base.replace(importExtension, "");
			const matches = [
				...new Set([
					base,
					...[
						".ts",
						".tsx",
						".js",
						".jsx",
						".mts",
						".cts",
						"/index.ts",
						"/index.tsx",
					].map((suffix) => `${stem}${suffix}`),
				]),
			].filter((candidate) => sources.has(candidate));
			if (matches.length > 1) {
				issues.add(`ambiguous_import:${specifier}`);
				return;
			}
			if (matches[0]) {
				if (!specifier.startsWith(".")) {
					issues.add(`inferred_import:${specifier}`);
				}
				return parse(matches[0], sources.get(matches[0]) ?? "") ?? undefined;
			}
		}
		const bare = !(specifier.startsWith(".") || specifier.startsWith("@/"));
		const packageRoot = moduleParts
			.slice(0, specifier.startsWith("@") ? 2 : 1)
			.join("/");
		if (!(bare && workspace.size && !workspace.has(packageRoot))) {
			issues.add(`unresolved_import:${specifier}`);
		}
	}
	function exported(
		target: Unit,
		name: string,
		issues: Set<string>,
		depth = 0
	): Reference | undefined {
		for (const statement of target.file.statements) {
			const modifiers = ts.canHaveModifiers(statement)
				? ts.getModifiers(statement)
				: undefined;
			if (modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
				if (
					ts.isFunctionDeclaration(statement) &&
					(statement.name?.text === name ||
						(name === "default" &&
							modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)))
				) {
					return { unit: target, node: statement };
				}
				if (ts.isVariableStatement(statement)) {
					for (const item of statement.declarationList.declarations) {
						if (ts.isIdentifier(item.name) && item.name.text === name) {
							return { unit: target, node: item };
						}
					}
				}
			}
			if (name === "default" && ts.isExportAssignment(statement)) {
				const node = ts.isIdentifier(statement.expression)
					? lookup(target, statement.expression.text, statement)
					: statement.expression;
				if (node) {
					return { unit: target, node };
				}
			}
			if (
				ts.isExportDeclaration(statement) &&
				statement.exportClause &&
				ts.isNamedExports(statement.exportClause)
			) {
				const match = statement.exportClause.elements.find(
					(item) => item.name.text === name
				);
				if (!match) {
					continue;
				}
				const importedName = match.propertyName?.text ?? match.name.text;
				if (!statement.moduleSpecifier) {
					const node = lookup(target, importedName, statement);
					if (node) {
						return { unit: target, node };
					}
				} else if (depth < 1 && ts.isStringLiteral(statement.moduleSpecifier)) {
					const next = moduleFile(
						target,
						statement.moduleSpecifier.text,
						issues
					);
					if (next) {
						return exported(next, importedName, issues, depth + 1);
					}
				}
			}
		}
		issues.add(`unresolved_export:${target.path}:${name}`);
	}
	function resolve(
		owner: Unit,
		name: string,
		at: ts.Node,
		issues: Set<string>
	): Reference | undefined {
		const local = lookup(owner, name, at);
		if (local) {
			return { unit: owner, node: local };
		}
		const imported = owner.imports.get(name);
		if (!imported && markup.test(owner.path)) {
			const methods: ts.Node[] = [];
			walk(owner.file, (node) => {
				if (
					(ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) &&
					node.name.getText(owner.file) === name &&
					functionValue(node)
				) {
					methods.push(node);
				}
			});
			if (methods[0]) {
				return { unit: owner, node: methods[0] };
			}
		}
		if (!imported) {
			const [script, ...others] = scriptFunctions(sources).get(name) ?? [];
			const shared =
				script && !others.length
					? parse(script, sources.get(script) ?? "")
					: null;
			const node = shared && lookup(shared, name, shared.file);
			return shared && node ? { unit: shared, node } : undefined;
		}
		const target = moduleFile(owner, imported.module, issues);
		if (target) {
			return exported(target, imported.name, issues);
		}
	}
	function routine(
		input: ts.Node,
		owner: Unit,
		visited = new Set<ts.Node>()
	): boolean {
		const expression = unwrap(input);
		if (fallback(expression)) {
			return (
				routine(expression.left, owner, new Set(visited)) &&
				routine(expression.right, owner, new Set(visited))
			);
		}
		if (ts.isPropertyAccessExpression(expression)) {
			if (queryHelper.test(expression.name.text)) {
				return true;
			}
			const passed = indirect(owner, expression);
			return (
				passed.length > 0 &&
				passed.every((target) =>
					routine(target.node, target.unit, new Set(visited))
				)
			);
		}
		if (ts.isIdentifier(expression)) {
			const bound = lookup(owner, expression.text, expression);
			if (!bound || visited.has(bound)) {
				return false;
			}
			if (
				owner.stateSetters.has(bound) ||
				(ts.isBindingElement(bound) &&
					queryHelper.test(
						bound.propertyName?.getText(owner.file) ?? expression.text
					))
			) {
				return true;
			}
			visited.add(bound);
			if (ts.isParameter(bound) || ts.isBindingElement(bound)) {
				const passed = indirect(owner, expression);
				return (
					passed.length > 0 &&
					passed.every((target) =>
						routine(target.node, target.unit, new Set(visited))
					)
				);
			}
			const fn = functionValue(bound);
			return fn ? routine(fn, owner, visited) : false;
		}
		const calls: ts.CallExpression[] = [];
		let navigates = false;
		walk(expression, (node) => {
			if (ts.isCallExpression(node)) {
				calls.push(node);
			}
			if (
				ts.isBinaryExpression(node) &&
				node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				navigation.test(node.left.getText(owner.file))
			) {
				navigates = true;
			}
		});
		if (calls.length === 0) {
			return isFunction(expression) && !navigates;
		}
		return calls.every((call) => {
			const name = call.expression.getText(owner.file);
			return (
				routineCall.test(name) ||
				(ts.isIdentifier(call.expression) &&
					routine(call.expression, owner, new Set(visited)))
			);
		});
	}
	function describe(initializer: ts.Node | undefined, labels: string[]) {
		const expression =
			initializer && ts.isJsxExpression(initializer) && initializer.expression
				? unwrap(initializer.expression)
				: undefined;
		if (
			expression &&
			ts.isIdentifier(expression) &&
			!genericHandler.test(expression.text)
		) {
			return ` ${expression.text}`;
		}
		const text = decode(labels.join(" ")).replace(whitespaceRun, " ").trim();
		return text ? ` "${text.slice(0, 40)}"` : "";
	}
	function routeHandler(
		call: ts.CallExpression,
		owner: Unit,
		issues: Set<string>
	): Reference | undefined {
		const url = call.arguments[0] && urlParts(call.arguments[0]);
		if (!url) {
			return;
		}
		const dynamic = (parts: string[]) =>
			parts.filter((part) => part.startsWith("[")).length;
		const matches = routeTable(sources)
			.filter((route) => routeMatches(route.parts, url))
			.sort((a, b) => dynamic(a.parts) - dynamic(b.parts));
		const route =
			matches.length === 1 ||
			(matches[0] &&
				matches[1] &&
				dynamic(matches[0].parts) < dynamic(matches[1].parts))
				? matches[0]
				: undefined;
		if (!route) {
			return;
		}
		const init = call.arguments[1];
		const method =
			init && ts.isObjectLiteralExpression(init)
				? init.properties.find(
						(property): property is ts.PropertyAssignment =>
							ts.isPropertyAssignment(property) &&
							property.name.getText(owner.file) === "method"
					)?.initializer
				: undefined;
		const target = parse(route.path, sources.get(route.path) ?? "");
		if (!target) {
			return;
		}
		return exported(
			target,
			route.export === "default"
				? "default"
				: method && ts.isStringLiteralLike(method)
					? method.text.toUpperCase()
					: "GET",
			issues
		);
	}
	let followingLink = false;
	function requestMethod(input: ts.Node, owner: Unit) {
		if (followingLink) {
			return "get";
		}
		const parent = input.parent;
		if (ts.isJsxAttribute(parent) || ts.isJsxExpression(parent)) {
			return "get";
		}
		if (!(ts.isCallExpression(parent) && parent.arguments[0] === input)) {
			return;
		}
		const callee = parent.expression;
		if (ts.isPropertyAccessExpression(callee)) {
			const name = callee.name.text.toLowerCase();
			return routeMethods.has(name) && name !== "handler" ? name : undefined;
		}
		if (ts.isIdentifier(callee) && callee.text === "fetch") {
			const init = parent.arguments[1];
			const method =
				init && ts.isObjectLiteralExpression(init)
					? init.properties.find(
							(property): property is ts.PropertyAssignment =>
								ts.isPropertyAssignment(property) &&
								property.name.getText(owner.file) === "method"
						)?.initializer
					: undefined;
			return method && ts.isStringLiteralLike(method)
				? method.text.toLowerCase()
				: "get";
		}
	}
	function serverHandlers(input: ts.Node, owner: Unit): Reference[] {
		const url = urlParts(input);
		if (!url || url.length < 2) {
			return [];
		}
		const method = requestMethod(input, owner);
		const matches = serverTable(sources).filter(
			(route) =>
				route.path !== owner.path &&
				serverMatches(route.parts, url) &&
				(!method || route.method === method || route.method === "all")
		);
		if (matches.length !== 1) {
			return [];
		}
		return matches.flatMap((route) => {
			const target = parse(route.path, sources.get(route.path) ?? "");
			const found: Reference[] = [];
			if (target) {
				walk(target.file, (node) => {
					if (
						ts.isCallExpression(node) &&
						ts.isPropertyAccessExpression(node.expression) &&
						node.expression.name.text === route.method &&
						target.file.getLineAndCharacterOfPosition(
							node.expression.name.getStart(target.file)
						).line +
							1 ===
							route.line
					) {
						const callback = [...node.arguments].reverse().find(callable);
						const value = callback && unwrap(callback);
						const named =
							value && ts.isIdentifier(value)
								? resolve(target, value.text, value, new Set())
								: undefined;
						if (named && !ts.isParameter(named.node) && callback) {
							found.push(named, { unit: target, node: callback });
						} else if (value && isFunction(value)) {
							found.push({ unit: target, node: value });
						}
					}
				});
			}
			return found;
		});
	}
	const usages = new Map<string, Reference[]>();
	function componentOf(parameter: ts.ParameterDeclaration) {
		const fn = parameter.parent;
		const name =
			ts.isFunctionDeclaration(fn) && fn.name
				? fn.name.text
				: ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)
					? fn.parent.name.text
					: undefined;
		const isDefault =
			ts.isFunctionDeclaration(fn) &&
			!!ts
				.getModifiers(fn)
				?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
		return name && fn.parameters[0] === parameter
			? { name, isDefault }
			: undefined;
	}
	function propName(parameter: ts.ParameterDeclaration, local: string) {
		if (ts.isIdentifier(parameter.name)) {
			return;
		}
		let found: string | undefined;
		walk(parameter.name, (part) => {
			if (
				ts.isBindingElement(part) &&
				ts.isIdentifier(part.name) &&
				part.name.text === local
			) {
				found = part.propertyName?.getText() ?? local;
			}
		});
		return found;
	}
	function passedProps(
		owner: Unit,
		parameter: ts.ParameterDeclaration,
		prop: string
	): Reference[] {
		const component = componentOf(parameter);
		if (!component) {
			return [];
		}
		const key = `${owner.path}:${component.name}:${prop}`;
		const cached = usages.get(key);
		if (cached) {
			return cached;
		}
		const found: Reference[] = [];
		const stem = posix.basename(owner.path).replace(extension, "");
		for (const [candidate, text] of sources) {
			if (
				!(
					text.includes(component.name) ||
					(component.isDefault && text.includes(stem))
				)
			) {
				continue;
			}
			const caller = parse(candidate, text);
			if (!caller) {
				continue;
			}
			const tags = new Set<string>();
			if (caller.path === owner.path) {
				tags.add(component.name);
			}
			for (const [local, entry] of caller.imports) {
				if (
					(entry.name === component.name ||
						(entry.name === "default" && component.isDefault)) &&
					moduleFile(caller, entry.module, new Set())?.path === owner.path
				) {
					tags.add(local);
				}
			}
			if (!tags.size) {
				continue;
			}
			walk(caller.file, (node) => {
				if (
					(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
					tags.has(node.tagName.getText(caller.file))
				) {
					for (const attribute of node.attributes.properties) {
						if (
							ts.isJsxAttribute(attribute) &&
							attribute.name.getText(caller.file) === prop &&
							attribute.initializer &&
							ts.isJsxExpression(attribute.initializer) &&
							attribute.initializer.expression
						) {
							found.push({
								unit: caller,
								node: attribute.initializer.expression,
							});
						}
					}
				}
			});
		}
		usages.set(key, found);
		return found;
	}
	function hookMember(
		owner: Unit,
		call: ts.Expression,
		member: string
	): Reference | undefined {
		const hook = unwrap(call);
		if (!(ts.isCallExpression(hook) && ts.isIdentifier(hook.expression))) {
			return;
		}
		const target = resolve(owner, hook.expression.text, hook, new Set());
		const fn = target && functionValue(target.node);
		if (!(target && fn?.body)) {
			return;
		}
		let value: Reference | undefined;
		walk(fn.body, (node) => {
			if (
				value ||
				!ts.isReturnStatement(node) ||
				enclosingFunction(node) !== fn ||
				!node.expression
			) {
				return;
			}
			const returned = unwrap(node.expression);
			if (!ts.isObjectLiteralExpression(returned)) {
				return;
			}
			for (const property of returned.properties) {
				if (property.name?.getText(target.unit.file) !== member) {
					continue;
				}
				if (ts.isShorthandPropertyAssignment(property)) {
					const bound = lookup(target.unit, member, property);
					value = bound ? { unit: target.unit, node: bound } : undefined;
				} else if (ts.isPropertyAssignment(property)) {
					value = { unit: target.unit, node: property.initializer };
				} else if (ts.isMethodDeclaration(property)) {
					value = { unit: target.unit, node: property };
				}
			}
		});
		return value;
	}
	function indirect(owner: Unit, expression: ts.Node): Reference[] {
		const node = unwrap(expression);
		const [base, member] = ts.isPropertyAccessExpression(node)
			? [unwrap(node.expression), node.name.text]
			: [node, undefined];
		if (!ts.isIdentifier(base)) {
			return [];
		}
		const bound = lookup(owner, base.text, base);
		if (bound && ts.isParameter(bound)) {
			const prop = member ?? propName(bound, base.text);
			return prop ? passedProps(owner, bound, prop) : [];
		}
		if (
			member &&
			bound &&
			ts.isVariableDeclaration(bound) &&
			bound.initializer
		) {
			const found = hookMember(owner, bound.initializer, member);
			return found ? [found] : [];
		}
		if (!member && bound && ts.isBindingElement(bound)) {
			const holder = declaration(bound);
			const variable = ts.isVariableStatement(holder)
				? holder.declarationList.declarations.find(
						(item) => item.name === bound.parent
					)
				: undefined;
			const prop = bound.propertyName?.getText(owner.file) ?? base.text;
			const source = variable?.initializer && unwrap(variable.initializer);
			const props =
				source && ts.isIdentifier(source)
					? lookup(owner, source.text, source)
					: undefined;
			if (props && ts.isParameter(props)) {
				return passedProps(owner, props, prop);
			}
			const found =
				variable?.initializer && hookMember(owner, variable.initializer, prop);
			return found ? [found] : [];
		}
		return [];
	}
	const roots: {
		node: ts.Node;
		owner: ts.Node;
		callbacks: ts.Node[];
		label: string;
		component?: string;
		link?: ts.Node;
		wrapper?: ts.Node;
		route?: ts.Node;
		needsWrite?: boolean;
		userEvent?: boolean;
		tracked?: string;
	}[] = [];
	const formHandler = (input: ts.Node) => {
		const value = unwrap(input);
		if (!ts.isIdentifier(value)) {
			return isFunction(value);
		}
		const bound = lookup(unit, value.text, value);
		return !(bound && ts.isVariableDeclaration(bound) && !functionValue(bound));
	};
	walk(unit.file, (node) => {
		if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
			const whole = ts.isJsxOpeningElement(node) ? node.parent : node;
			const tag = node.tagName.getText(unit.file),
				component = tag.split(".").at(-1) ?? tag;
			const owner = enclosingFunction(node),
				ownerName =
					owner?.name?.getText(unit.file) ??
					(owner && ts.isVariableDeclaration(owner.parent)
						? owner.parent.name.getText(unit.file)
						: "");
			if (["Button", "CopyButton", "Link"].includes(ownerName)) {
				return;
			}
			const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
			const events = attributes.filter(
				(attribute) =>
					handlers.has(attribute.name.getText(unit.file)) &&
					attribute.initializer &&
					ts.isJsxExpression(attribute.initializer) &&
					attribute.initializer.expression &&
					![ts.SyntaxKind.NullKeyword, ts.SyntaxKind.FalseKeyword].includes(
						attribute.initializer.expression.kind
					) &&
					(!formAttributes.has(attribute.name.getText(unit.file)) ||
						formHandler(attribute.initializer.expression))
			);
			const ownsHandler = (part: ts.Node) =>
				(ts.isJsxElement(part) || ts.isJsxSelfClosingElement(part)) &&
				(ts.isJsxElement(part)
					? part.openingElement
					: part
				).attributes.properties.some(
					(attribute) =>
						ts.isJsxAttribute(attribute) &&
						handlers.has(attribute.name.getText(unit.file))
				);
			const mentioned: string[] = [];
			const text = (part: ts.Node, shown: string[] | null) => {
				if (ts.isJsxAttribute(part)) {
					return;
				}
				if (ts.isConditionalExpression(part)) {
					const idle: string[] = [];
					text(part.whenFalse, idle);
					text(part.whenTrue, idle.length ? null : shown);
					shown?.push(...idle);
					return;
				}
				if (
					(ts.isJsxText(part) ||
						(ts.isStringLiteralLike(part) &&
							!ts.isBinaryExpression(part.parent))) &&
					!pending.test(part.text)
				) {
					mentioned.push(part.text);
					shown?.push(part.text);
				}
				ts.forEachChild(part, (child) => {
					if (!ownsHandler(child)) {
						text(child, shown);
					}
				});
			};
			const buttons: ts.JsxElement[] = [];
			const findButtons = (part: ts.Node) => {
				if (
					ts.isJsxElement(part) &&
					part.openingElement.tagName
						.getText(unit.file)
						.toLowerCase()
						.endsWith("button")
				) {
					buttons.push(part);
					return;
				}
				ts.forEachChild(part, findButtons);
			};
			const submits = (button: ts.JsxElement) =>
				button.openingElement.attributes.properties.some(
					(property) =>
						ts.isJsxAttribute(property) &&
						property.name.getText(unit.file) === "type" &&
						!!property.initializer &&
						ts.isStringLiteral(property.initializer) &&
						property.initializer.text === "submit"
				);
			const attributeValue = (name: string) =>
				attributes.find(
					(candidate) => candidate.name.getText(unit.file) === name
				)?.initializer;
			const role = attributeValue("role");
			const contentNamed =
				component !== component.toLowerCase() ||
				namedByContent.has(component) ||
				(!!role &&
					ts.isStringLiteral(role) &&
					contentRoles.has(role.text.toLowerCase()));
			const content: string[] = [];
			if (ts.isJsxElement(whole)) {
				if (component.toLowerCase() === "form") {
					for (const child of whole.children) {
						findButtons(child);
					}
				}
				const button =
					buttons.find(submits) ??
					buttons.filter((candidate) => !ownsHandler(candidate)).at(-1) ??
					buttons.at(-1);
				if (button) {
					text(button, content);
				} else if (component.toLowerCase() !== "form") {
					for (const child of whole.children) {
						if (!ownsHandler(child)) {
							text(child, contentNamed ? content : null);
						}
					}
				}
			}
			const [ariaLabel, labelProp, title]: string[][] = [[], [], []];
			const ariaNode = attributeValue("aria-label"),
				labelNode = attributeValue("label"),
				titleNode = attributeValue("title"),
				hrefNode = attributeValue("href");
			if (ariaNode) {
				text(ariaNode, ariaLabel);
			}
			if (labelNode && component !== component.toLowerCase()) {
				text(labelNode, labelProp);
			}
			if (titleNode) {
				text(titleNode, title);
			}
			if (hrefNode) {
				text(hrefNode, null);
			}
			const labels = [ariaLabel, content, labelProp, title].find(
				(words) => words.join("").trim().length
			);
			const productIntent = intent.test(mentioned.join(" "));
			const active = events
				.filter((attribute) => {
					const expression = (attribute.initializer as ts.JsxExpression)
						.expression;
					return expression && (!routine(expression, unit) || productIntent);
				})
				.sort(
					(left, right) =>
						Number(!submitHandler.test(left.name.getText(unit.file))) -
						Number(!submitHandler.test(right.name.getText(unit.file)))
				);
			const delegated =
				component === "CopyButton" ||
				(["Link", "a"].includes(component) &&
					productIntent &&
					attributes.some(
						(attribute) => attribute.name.getText(unit.file) === "href"
					));
			if (!(active.length || delegated)) {
				return;
			}
			const href = attributes.find(
				(attribute) => attribute.name.getText(unit.file) === "href"
			)?.initializer;
			const link = href && ts.isJsxExpression(href) ? href.expression : href;
			roots.push({
				...(!active.length && link ? { link } : {}),
				node: active[0] ?? whole,
				owner: whole,
				callbacks: active
					.map(
						(attribute) =>
							(attribute.initializer as ts.JsxExpression).expression
					)
					.filter((expression): expression is ts.Expression => !!expression),
				label: `${tag}.${active[0]?.name.getText(unit.file) ?? (component === "CopyButton" ? "copy" : "intent")}${describe(active[0]?.initializer, labels ?? [])}`,
				tracked: active.every(
					(attribute) => attribute.name.getText(unit.file) === "onClick"
				)
					? trackedBy(whole, unit.file)
					: undefined,
				needsWrite:
					active.length > 0 &&
					active.every((attribute) =>
						selections.has(attribute.name.getText(unit.file))
					),
				userEvent:
					component !== "CopyButton" && active.length > 0 && !productIntent,
				...(component === "CopyButton" ? { component: tag } : {}),
			});
		}
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			routeMethods.has(node.expression.name.text)
		) {
			const method = node.expression.name.text;
			if (
				method !== "handler" &&
				!(node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
			) {
				return;
			}
			const callback = [...node.arguments]
				.reverse()
				.find(
					(argument) =>
						isFunction(unwrap(argument)) ||
						(ts.isIdentifier(argument) &&
							!!functionValue(
								lookup(unit, argument.text, argument) ?? argument
							))
				);
			if (callback) {
				const route =
					node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
						? node.arguments[0]
						: undefined;
				roots.push({
					node: callback,
					owner: callback,
					callbacks: [callback],
					label: `${method}${route ? ` ${route.text.slice(0, 120)}` : ""}`,
					wrapper: node.expression.expression,
					route,
				});
			}
		}
		const handler =
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			functionValue(node.initializer)
				? node.initializer
				: ts.isFunctionDeclaration(node) &&
						node.body &&
						ts
							.getModifiers(node)
							?.some(
								(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
							)
					? node
					: undefined;
		const method =
			handler &&
			(ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node))
				? node.name?.getText(unit.file)
				: undefined;
		if (handler && method && httpMethods.has(method)) {
			roots.push({
				node,
				owner: node,
				callbacks: [handler],
				label: method,
				needsWrite: !writeMethods.has(method),
			});
		}
		const nitro = nitroRoute.exec(unit.path);
		if (
			nitro &&
			ts.isExportAssignment(node) &&
			ts.isCallExpression(unwrap(node.expression))
		) {
			const call = unwrap(node.expression) as ts.CallExpression;
			const [callback] = call.arguments;
			if (
				nitroHandler.test(call.expression.getText(unit.file)) &&
				callback &&
				callable(callback)
			) {
				const method = nitro[3]?.toUpperCase();
				roots.push({
					node: callback,
					owner: node,
					callbacks: [callback],
					label: `${method ?? "handler"} /${nitro[1]}/${(nitro[2] ?? "").replace(indexSuffix, "")}`,
					needsWrite: !(method && writeMethods.has(method)),
				});
			}
		}
		const routeModule = remixRoute.exec(unit.path);
		if (
			handler &&
			method === "action" &&
			routeModule &&
			exportedDeclaration(node)
		) {
			roots.push({
				node,
				owner: node,
				callbacks: [handler],
				label: `action ${routeModule[1]}`,
			});
		}
		const page = svelteKitPage.exec(unit.path);
		if (
			page &&
			ts.isVariableDeclaration(node) &&
			node.name.getText(unit.file) === "actions" &&
			exportedDeclaration(node) &&
			node.initializer &&
			ts.isObjectLiteralExpression(unwrap(node.initializer))
		) {
			const route = `/${(page[1] ?? "")
				.split("/")
				.filter((part) => part && !routeGroup.test(part))
				.join("/")}`;
			for (const property of (
				unwrap(node.initializer) as ts.ObjectLiteralExpression
			).properties) {
				const name = property.name?.getText(unit.file);
				const value = ts.isPropertyAssignment(property)
					? property.initializer
					: ts.isMethodDeclaration(property)
						? property
						: undefined;
				if (name && value && callable(value)) {
					roots.push({
						node: property,
						owner: property,
						callbacks: [value],
						label: `POST ${route}${name === "default" ? "" : `?/${name}`}`,
					});
				}
			}
		}
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			domListeners.has(node.expression.name.text)
		) {
			const [type] = node.arguments;
			const listener = [...node.arguments].reverse().find(callable);
			if (
				type &&
				ts.isStringLiteralLike(type) &&
				domEvents.has(type.text) &&
				listener &&
				!routine(listener, unit)
			) {
				roots.push({
					node: listener,
					owner: node,
					callbacks: [listener],
					label: `${brief(node.expression.expression, unit.file)}.${type.text}`,
				});
			}
		}
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isPropertyAccessExpression(node.left) &&
			domProperties.has(node.left.name.text) &&
			callable(node.right) &&
			!routine(node.right, unit)
		) {
			roots.push({
				node: node.right,
				owner: node,
				callbacks: [node.right],
				label: `${brief(node.left.expression, unit.file)}.${node.left.name.text.slice(2)}`,
			});
		}
		if (
			ts.isPropertyAssignment(node) &&
			afterHook.test(node.name.getText(unit.file)) &&
			functionValue(node.initializer)
		) {
			for (
				let ancestor: ts.Node | undefined = node.parent;
				ancestor;
				ancestor = ancestor.parent
			) {
				if (
					ts.isPropertyAssignment(ancestor) &&
					hookContainer.test(ancestor.name.getText(unit.file))
				) {
					roots.push({
						node,
						owner: node,
						callbacks: [node.initializer],
						label: node.name.getText(unit.file),
					});
					break;
				}
			}
		}
	});
	return roots.flatMap((root) => {
		const issues = new Set<string>(),
			sites = new Map<string, Site>(),
			contexts = new Map<string, string>(),
			excerpts: Site[] = [];
		let characters = 0;
		const addSite = (owner: Unit, node: ts.Node) => {
			const location = site(owner, node);
			sites.set(`${location.path}:${location.start}:${location.end}`, location);
		};
		const frame = (owner: Unit, node: ts.Node) => {
			const location = site(owner, node);
			return {
				location,
				key: `${location.path}:${node.pos}:${node.end}`,
				framed: `// ${location.path}:${location.start}-${location.end}\n${node.getText(owner.file)}`,
			};
		};
		const addContext = (owner: Unit, node: ts.Node) => {
			const { location, key, framed } = frame(owner, node);
			if (contexts.has(key)) {
				return;
			}
			if (characters + framed.length > contextLimit) {
				issues.add(`truncated_context:${location.path}:${location.start}`);
				return;
			}
			contexts.set(key, framed);
			excerpts.push(location);
			characters += framed.length + 2;
		};
		addSite(unit, root.node);
		const opening = ts.isJsxElement(root.owner)
			? root.owner.openingElement
			: root.owner;
		addContext(unit, opening);
		if (root.route) {
			addContext(unit, root.route);
		}
		const functionOwner = enclosingFunction(root.node);
		if (functionOwner?.body && ts.isBlock(functionOwner.body)) {
			for (const statement of functionOwner.body.statements) {
				if (
					statement.end < root.node.getStart(unit.file) &&
					(ts.isIfStatement(statement) || ts.isThrowStatement(statement))
				) {
					addContext(unit, statement);
				}
			}
		}
		for (
			let parent = root.owner.parent;
			parent && !isFunction(parent);
			parent = parent.parent
		) {
			if (
				ts.isConditionalExpression(parent) ||
				(ts.isBinaryExpression(parent) &&
					[
						ts.SyntaxKind.AmpersandAmpersandToken,
						ts.SyntaxKind.BarBarToken,
						ts.SyntaxKind.QuestionQuestionToken,
					].includes(parent.operatorToken.kind))
			) {
				addContext(unit, parent);
			} else if (ts.isIfStatement(parent)) {
				addContext(unit, parent.expression);
			}
		}
		const visited = new Set<ts.Node>();
		let commits = false;
		const copied: string[] = [];
		function evidence(owner: Unit, node: ts.Node, depth: number) {
			if (visited.has(node)) {
				return;
			}
			visited.add(node);
			addContext(owner, declaration(node));
			walk(node, (child) => {
				if (
					root.userEvent &&
					depth <= 1 &&
					((ts.isAwaitExpression(child) &&
						ts.isCallExpression(unwrap(child.expression)) &&
						!readCall.test(
							(unwrap(child.expression) as ts.CallExpression).expression
								.getText(owner.file)
								.split(".")
								.at(-1) ?? ""
						)) ||
						(ts.isPropertyAccessExpression(child) &&
							downloadSignal.test(child.getText(owner.file))) ||
						(ts.isCallExpression(child) &&
							actionVerb.test(
								child.expression.getText(owner.file).split(".").at(-1) ?? ""
							)))
				) {
					commits = true;
				}
				if (
					ts.isPropertyAssignment(child) &&
					mutationCallbacks.has(child.name.getText(owner.file)) &&
					ts.isIdentifier(unwrap(child.initializer))
				) {
					follow(owner, child.initializer, depth);
					return;
				}
				if (
					depth < 2 &&
					(ts.isStringLiteral(child) ||
						ts.isNoSubstitutionTemplateLiteral(child) ||
						ts.isTemplateExpression(child))
				) {
					for (const handler of serverHandlers(child, owner)) {
						addSite(handler.unit, handler.node);
						if (!ts.isIdentifier(unwrap(handler.node))) {
							const linking = followingLink;
							followingLink = false;
							evidence(handler.unit, handler.node, depth + 1);
							followingLink = linking;
						}
					}
				}
				if (!ts.isCallExpression(child)) {
					return;
				}
				const callee = child.expression;
				if (ts.isPropertyAccessExpression(callee)) {
					const method = callee.name.text;
					const write =
						writes.has(method) &&
						callee.expression.getText(owner.file) !== "Object";
					if ((write && method !== "writeText") || httpWrites.has(method)) {
						commits = true;
					}
					if (write || trackingCall.test(method)) {
						addSite(owner, child);
					}
					if (method === "writeText") {
						copied.push(...child.arguments.map((a) => a.getText(owner.file)));
						for (const argument of child.arguments) {
							walk(argument, (part) => {
								const bound =
									ts.isIdentifier(part) && lookup(owner, part.text, part);
								if (
									bound &&
									ts.isVariableDeclaration(bound) &&
									!functionValue(bound)
								) {
									addContext(owner, declaration(bound));
									copied.push(declaration(bound).getText(owner.file));
								}
							});
						}
					}
					if (
						["mutate", "mutateAsync"].includes(method) &&
						ts.isIdentifier(callee.expression)
					) {
						const config = lookup(owner, callee.expression.text, child);
						if (config && depth < 2) {
							evidence(owner, config, depth + 1);
						} else if (!config) {
							issues.add(`unresolved_mutation:${callee.expression.text}`);
						}
					} else if (
						depth < 2 &&
						boundCall.has(method) &&
						ts.isIdentifier(callee.expression) &&
						(method !== "bind" ||
							child.parent === node ||
							(ts.isCallExpression(child.parent) &&
								child.parent.expression === child))
					) {
						addSite(owner, child);
						follow(owner, callee.expression, depth + 1);
					} else if (depth < 2) {
						for (const target of indirect(owner, callee)) {
							addSite(owner, child);
							pursue(target, hop(target, depth));
						}
					}
					return;
				}
				if (!ts.isIdentifier(callee)) {
					return;
				}
				if (trackingCall.test(callee.text)) {
					addSite(owner, child);
				}
				if (callee.text === "fetch") {
					if (writesOverFetch(child, owner)) {
						commits = true;
					}
					const handler = routeHandler(child, owner, issues);
					if (handler && depth < 2) {
						addSite(handler.unit, handler.node);
						evidence(handler.unit, handler.node, depth + 1);
					}
				}
				const resolved = resolve(owner, callee.text, child, issues);
				if (resolved?.unit.stateSetters.has(resolved.node)) {
					return;
				}
				const passed = resolved && depth < 2 ? indirect(owner, callee) : [];
				if (passed.length) {
					addSite(owner, child);
					for (const target of passed) {
						pursue(target, hop(target, depth));
					}
				} else if (resolved && !ts.isParameter(resolved.node)) {
					if (depth < 2) {
						addSite(owner, child);
						evidence(resolved.unit, resolved.node, depth + 1);
					} else if (functionValue(resolved.node)) {
						issues.add(`context_depth:${callee.text}`);
					}
				} else if (
					resolved ||
					![
						"fetch",
						"useMutation",
						"useCallback",
						"useEvent",
						"Boolean",
						"String",
						"Number",
						"setTimeout",
					].includes(callee.text)
				) {
					issues.add(`unresolved_call:${callee.text}`);
				}
			});
		}
		function pursue(target: Reference, depth: number) {
			if (
				ts.isVariableDeclaration(target.node) ||
				ts.isFunctionDeclaration(target.node) ||
				ts.isMethodDeclaration(target.node) ||
				ts.isBindingElement(target.node)
			) {
				evidence(target.unit, target.node, depth);
			} else {
				follow(target.unit, target.node, depth);
			}
		}
		function follow(owner: Unit, input: ts.Node, depth = 0) {
			const expression = unwrap(input);
			if (visited.has(expression)) {
				return;
			}
			if (isFunction(expression)) {
				evidence(owner, expression, depth);
				return;
			}
			if (ts.isConditionalExpression(expression)) {
				follow(owner, expression.whenTrue, depth);
				follow(owner, expression.whenFalse, depth);
				return;
			}
			if (fallback(expression)) {
				follow(owner, expression.left, depth);
				follow(owner, expression.right, depth);
				return;
			}
			if (ts.isCallExpression(expression)) {
				const handlers = expression.arguments.filter(callable);
				for (const argument of handlers) {
					follow(owner, argument, depth);
				}
				if (handlers.length) {
					return;
				}
			}
			visited.add(expression);
			if (
				ts.isPropertyAccessExpression(expression) &&
				["mutate", "mutateAsync"].includes(expression.name.text) &&
				ts.isIdentifier(expression.expression)
			) {
				const config = lookup(owner, expression.expression.text, expression);
				if (config) {
					commits = true;
					evidence(owner, config, depth);
					return;
				}
			}
			const passed = depth < 2 ? indirect(owner, expression) : [];
			if (passed.length) {
				addContext(owner, declaration(lookupBase(owner, expression)));
				for (const target of passed) {
					pursue(target, hop(target, depth));
				}
				return;
			}
			const resolved = ts.isIdentifier(expression)
				? resolve(owner, expression.text, expression, issues)
				: undefined;
			if (!resolved || ts.isParameter(resolved.node)) {
				issues.add(`unresolved_callback:${expression.getText(owner.file)}`);
				return;
			}
			const holder = resolved.node.parent?.parent;
			const hook =
				ts.isBindingElement(resolved.node) &&
				holder &&
				ts.isVariableDeclaration(holder) &&
				holder.initializer
					? unwrap(holder.initializer)
					: undefined;
			if (
				hook &&
				ts.isCallExpression(hook) &&
				formHook.test(hook.expression.getText(resolved.unit.file)) &&
				hook.arguments[0] &&
				!visited.has(hook)
			) {
				visited.add(hook);
				addContext(resolved.unit, declaration(holder));
				follow(resolved.unit, hook.arguments[0], depth);
				return;
			}
			evidence(resolved.unit, resolved.node, depth);
		}
		for (const callback of root.callbacks) {
			follow(unit, callback);
		}
		if (root.link) {
			const value = unwrap(root.link);
			const target = ts.isIdentifier(value)
				? resolve(unit, value.text, value, issues)
				: undefined;
			followingLink = true;
			evidence(target?.unit ?? unit, target?.node ?? root.link, 0);
			followingLink = false;
		}
		if (root.component) {
			const resolved = resolve(unit, root.component, root.node, issues);
			if (resolved) {
				evidence(resolved.unit, resolved.node, 0);
			} else {
				issues.add(`unresolved_component:${root.component}`);
			}
		}
		if (root.wrapper) {
			let base = root.wrapper;
			while (ts.isCallExpression(base) || ts.isPropertyAccessExpression(base)) {
				base = base.expression;
			}
			if (ts.isIdentifier(base)) {
				const resolved = resolve(unit, base.text, root.node, issues);
				if (resolved) {
					evidence(resolved.unit, resolved.node, 0);
				} else {
					issues.add(`unresolved_wrapper:${base.text}`);
				}
			}
		}
		if (copied.length && !commits) {
			if (
				!setupCopy.test(
					`${unit.path} ${root.label.slice(root.label.indexOf(".") + 1)} ${attributeText(root.owner, unit.file)} ${copied.join(" ")}`.replace(
						camelBoundary,
						"$1 $2"
					)
				)
			) {
				return [];
			}
		} else if (
			root.userEvent &&
			!commits &&
			![...issues].some((issue) => issue.startsWith("unresolved"))
		) {
			return [];
		}
		if (root.needsWrite && !commits) {
			return [];
		}
		if (opening !== root.owner) {
			const head = frame(unit, opening),
				whole = frame(unit, root.owner),
				kept = contexts.get(head.key);
			if (
				kept &&
				characters - kept.length + whole.framed.length <= contextLimit
			) {
				const entries = [...contexts].map(([key, value]): [string, string] =>
					key === head.key ? [whole.key, whole.framed] : [key, value]
				);
				contexts.clear();
				for (const [key, value] of entries) {
					contexts.set(key, value);
				}
				characters += whole.framed.length - kept.length;
				excerpts.splice(
					excerpts.findIndex(
						(location) =>
							location.path === head.location.path &&
							location.start === head.location.start &&
							location.end === head.location.end
					),
					1,
					whole.location
				);
			} else {
				issues.add(`truncated_context:${unit.path}:${whole.location.start}`);
			}
		}
		const location = site(unit, root.node);
		return [
			{
				start: location.start,
				end: location.end,
				label: root.label,
				commits,
				...(root.tracked ? { tracked: root.tracked } : {}),
				source: [...contexts.values()].join("\n\n"),
				sites: [...sites.values()],
				issues: [...issues],
				excerpts,
			},
		];
	});
}
