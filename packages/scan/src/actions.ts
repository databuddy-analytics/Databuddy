import { posix } from "node:path";
import ts from "typescript";

export interface Site {
	end: number;
	path: string;
	start: number;
}
export interface Action {
	end: number;
	issues: string[];
	label: string;
	sites: Site[];
	source: string;
	start: number;
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
const selection = /\.on(?:ValueChange|CheckedChange|Select)$/;
const handlers = new Set([
	"onClick",
	"onSubmit",
	"onCopy",
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
]);
const httpWrites = new Set(["post", "put", "patch"]);
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
	/^(?:(?:event|e)\.preventDefault|(?:router|history)\.(?:push|replace|back|refresh)|console\.\w+)$/;
const afterHook = /^after[A-Z]/;
const hookContainer = /^(?:hooks|organizationHooks|databaseHooks)$/;
const trackingCall = /^(?:track|capture|logEvent)/;

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
	if (ts.isVariableDeclaration(node) && node.initializer) {
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
function declaration(node: ts.Node): ts.Node {
	return ts.isVariableDeclaration(node) &&
		ts.isVariableDeclarationList(node.parent) &&
		ts.isVariableStatement(node.parent.parent)
		? node.parent.parent
		: node;
}
function lookup(unit: Unit, name: string, at: ts.Node): ts.Node | undefined {
	for (let parent: ts.Node | undefined = at; parent; parent = parent.parent) {
		const found = unit.bindings.get(parent)?.get(name);
		if (found) {
			return found;
		}
	}
}

export function groupActions(
	path: string,
	source: string,
	sources: ReadonlyMap<string, string>
): Action[] | null {
	const units = new Map<string, Unit | null>();
	function parse(key: string, text: string): Unit | null {
		if (units.has(key)) {
			return units.get(key) ?? null;
		}
		if (!extension.test(key)) {
			return null;
		}
		const file = ts.createSourceFile(
			key,
			text,
			ts.ScriptTarget.Latest,
			true,
			jsxExtension.test(key)
				? ts.ScriptKind.TSX
				: jsExtension.test(key)
					? ts.ScriptKind.JS
					: ts.ScriptKind.TS
		);
		// createSourceFile populates parseDiagnostics, omitted from TS's public SourceFile type.
		if (
			(file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] })
				.parseDiagnostics.length
		) {
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
			setter: ts.BindingElement;
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
					imported?.module === "react" &&
					["useState", "useReducer"].includes(imported.name)
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
		issues.add(`unresolved_import:${specifier}`);
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
		if (!imported) {
			return;
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
		if (ts.isIdentifier(expression)) {
			const bound = lookup(owner, expression.text, expression);
			if (!bound || visited.has(bound)) {
				return false;
			}
			if (owner.stateSetters.has(bound)) {
				return true;
			}
			visited.add(bound);
			const fn = functionValue(bound);
			return fn?.body ? routine(fn.body, owner, visited) : false;
		}
		const calls: ts.CallExpression[] = [];
		walk(expression, (node) => {
			if (ts.isCallExpression(node)) {
				calls.push(node);
			}
		});
		return (
			calls.length > 0 &&
			calls.every((call) => {
				const name = call.expression.getText(owner.file);
				return (
					routineCall.test(name) ||
					(ts.isIdentifier(call.expression) &&
						routine(call.expression, owner, new Set(visited)))
				);
			})
		);
	}
	const roots: {
		node: ts.Node;
		owner: ts.Node;
		callbacks: ts.Node[];
		label: string;
		component?: string;
		wrapper?: ts.Node;
		route?: ts.Node;
	}[] = [];
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
					)
			);
			const labels: string[] = [];
			const visible = (part: ts.Node) => {
				if (ts.isJsxAttribute(part)) {
					return;
				}
				if (ts.isJsxText(part) || ts.isStringLiteralLike(part)) {
					labels.push(part.text);
				}
				ts.forEachChild(part, visible);
			};
			if (ts.isJsxElement(whole)) {
				for (const child of whole.children) {
					visible(child);
				}
			}
			for (const attribute of attributes) {
				if (
					["title", "aria-label", "href"].includes(
						attribute.name.getText(unit.file)
					) &&
					attribute.initializer
				) {
					visible(attribute.initializer);
				}
			}
			const productIntent = intent.test(labels.join(" "));
			const active = events.filter((attribute) => {
				const expression = (attribute.initializer as ts.JsxExpression)
					.expression;
				return expression && (!routine(expression, unit) || productIntent);
			});
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
			roots.push({
				node: active[0] ?? whole,
				owner: whole,
				callbacks: active
					.map(
						(attribute) =>
							(attribute.initializer as ts.JsxExpression).expression
					)
					.filter((expression): expression is ts.Expression => !!expression),
				label: `${tag}.${active[0]?.name.getText(unit.file) ?? (component === "CopyButton" ? "copy" : "intent")}`,
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
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			httpMethods.has(node.name.text) &&
			node.initializer &&
			functionValue(node.initializer)
		) {
			roots.push({
				node,
				owner: node,
				callbacks: [node.initializer],
				label: node.name.text,
			});
		}
		if (
			ts.isFunctionDeclaration(node) &&
			node.name &&
			node.body &&
			writeMethods.has(node.name.text) &&
			ts
				.getModifiers(node)
				?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
		) {
			roots.push({
				node,
				owner: node,
				callbacks: [node],
				label: node.name.text,
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
			contexts = new Map<string, string>();
		let characters = 0;
		const addSite = (owner: Unit, node: ts.Node) => {
			const location = site(owner, node);
			sites.set(`${location.path}:${location.start}:${location.end}`, location);
		};
		const addContext = (owner: Unit, node: ts.Node) => {
			const location = site(owner, node),
				key = `${location.path}:${node.pos}:${node.end}`;
			if (contexts.has(key)) {
				return;
			}
			const text = node.getText(owner.file),
				framed = `// ${location.path}:${location.start}-${location.end}\n${text}`;
			if (characters + framed.length > contextLimit) {
				issues.add(`truncated_context:${location.path}:${location.start}`);
				return;
			}
			contexts.set(key, framed);
			characters += framed.length + 2;
		};
		addSite(unit, root.node);
		addContext(unit, root.owner);
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
		function evidence(owner: Unit, node: ts.Node, depth: number) {
			if (visited.has(node)) {
				return;
			}
			visited.add(node);
			addContext(owner, declaration(node));
			walk(node, (child) => {
				if (!ts.isCallExpression(child)) {
					return;
				}
				const callee = child.expression;
				if (ts.isPropertyAccessExpression(callee)) {
					const method = callee.name.text;
					if (writes.has(method) || httpWrites.has(method)) {
						commits = true;
					}
					if (
						writes.has(method) ||
						["track", "capture", "logEvent"].includes(method)
					) {
						addSite(owner, child);
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
					}
					return;
				}
				if (!ts.isIdentifier(callee)) {
					return;
				}
				if (trackingCall.test(callee.text)) {
					addSite(owner, child);
				}
				if (callee.text === "fetch" && writesOverFetch(child, owner)) {
					commits = true;
				}
				const resolved = resolve(owner, callee.text, child, issues);
				if (resolved?.unit.stateSetters.has(resolved.node)) {
					return;
				}
				if (resolved && !ts.isParameter(resolved.node)) {
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
		for (const callback of root.callbacks) {
			const expression = unwrap(callback);
			if (ts.isIdentifier(expression)) {
				const resolved = resolve(unit, expression.text, expression, issues);
				if (resolved && !ts.isParameter(resolved.node)) {
					evidence(resolved.unit, resolved.node, 0);
				} else {
					issues.add(`unresolved_callback:${expression.text}`);
				}
			} else if (isFunction(expression)) {
				evidence(unit, expression, 0);
			} else {
				issues.add(`unresolved_callback:${expression.getText(unit.file)}`);
			}
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
		if (selection.test(root.label) && !commits) {
			return [];
		}
		const location = site(unit, root.node);
		return [
			{
				start: location.start,
				end: location.end,
				label: root.label,
				source: [...contexts.values()].join("\n\n"),
				sites: [...sites.values()],
				issues: [...issues],
			},
		];
	});
}
