import ts from "typescript";

const trackingCallee = /^(?:track[A-Z]\w*|track|capture|logEvent)$/;
const trackingCall = /\b(?:track[A-Z]\w*|track|capture|logEvent)\s*\(/;
const warehouseTable = /custom_events/;
const warehouseInsert = /\.insert\(|insertCustomEvent/;
const routerSuffix = /Router$/;
const routerBinding = /Router\s*=/;
const procedureSuffix = /procedure$/i;
const trackedProcedure = /track/i;
const routeKey = /^\w+\.\w+$/;
const trailingS = /s$/;
const togglePrefix = /^toggle(.+)$/;
const camelBoundary = /([a-z])([A-Z])/g;
const tsxExtension = /\.tsx$/;
const lowerFirst = /^[a-z_$]/;
const regexSpecial = /[$()*+.?[\\\]^{|}]/g;
const trackProperties = /setTrackProperties\(\s*\{([\s\S]*?)\}/g;
const propertyName = /(?:^|[\s,{])([A-Za-z_]\w*)\s*:/g;
const eventLiteral =
	/\b(?:track[A-Z]\w*|track|capture|logEvent)\s*\(\s*\{?\s*(?:name:\s*)?["'`]([\w.:-]+)["'`]/g;
const dataTrack = /data-track=["'{]+([\w.:-]+)/;
const attributeOption =
	/\btrack(?:Attributes|-attributes)\b(?!\s*\??\s*:\s*boolean)(?!\s*[:=]\s*\{?\s*["'`]?false\b)/;
const attributeSelector =
	/\(\s*["'`][^"'`\n]*\[data-track[\]\s=~|^$*]|\.dataset\.track\b/;
const commentLine = /^\s*(?:\/\/|\/?\*)/;
const scriptFile = /\.[cm]?[jt]sx?$/;
const collectorPackage =
	/^(?:apps\/basket|packages\/(?:sdk|sdk-swift|tracker|nuxt|devtools))\//;
const verbs: Record<string, string> = {
	add: "created",
	create: "created",
	delete: "deleted",
	edit: "updated",
	remove: "deleted",
	rename: "renamed",
	rotate: "rotated",
	revoke: "revoked",
	test: "tested",
	transfer: "transferred",
	update: "updated",
};

const snake = (value: string) =>
	value.replace(camelBoundary, "$1_$2").toLowerCase();
const parse = (path: string, source: string) =>
	ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
		tsxExtension.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
	);
const lineOf = (file: ts.SourceFile, position: number) =>
	file.getLineAndCharacterOfPosition(position).line + 1;

function walk(node: ts.Node, visit: (child: ts.Node) => void) {
	visit(node);
	ts.forEachChild(node, (child) => walk(child, visit));
}
function baseIdentifier(node: ts.Expression): string | null {
	let current: ts.Node = node;
	while (
		ts.isCallExpression(current) ||
		ts.isPropertyAccessExpression(current) ||
		ts.isParenthesizedExpression(current)
	) {
		current = current.expression;
	}
	return ts.isIdentifier(current) ? current.text : null;
}
function propertyKey(name: ts.PropertyName) {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
		return name.text;
	}
	return null;
}
function exportedObjects(file: ts.SourceFile) {
	const found: { name: string; object: ts.ObjectLiteralExpression }[] = [];
	for (const statement of file.statements) {
		if (
			!(
				ts.isVariableStatement(statement) &&
				statement.modifiers?.some(
					(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
				)
			)
		) {
			continue;
		}
		for (const { name, initializer } of statement.declarationList
			.declarations) {
			if (
				ts.isIdentifier(name) &&
				initializer &&
				ts.isObjectLiteralExpression(initializer)
			) {
				found.push({ name: name.text, object: initializer });
			}
		}
	}
	return found;
}

function routerKeys(sources: ReadonlyMap<string, string>) {
	const keys = new Map<string, string>();
	for (const [path, source] of sources) {
		if (!source.includes("Router")) {
			continue;
		}
		for (const { object } of exportedObjects(parse(path, source))) {
			const mounted = object.properties.filter(
				(property): property is ts.PropertyAssignment =>
					ts.isPropertyAssignment(property) &&
					ts.isIdentifier(property.initializer) &&
					routerSuffix.test(property.initializer.text)
			);
			if (mounted.length < 3) {
				continue;
			}
			for (const property of mounted) {
				const key = propertyKey(property.name);
				if (key && ts.isIdentifier(property.initializer)) {
					keys.set(property.initializer.text, key);
				}
			}
		}
	}
	return keys;
}

function nameOverrides(sources: ReadonlyMap<string, string>) {
	const overrides: Record<string, string> = {};
	for (const [path, source] of sources) {
		if (!source.includes('": "')) {
			continue;
		}
		walk(parse(path, source), (node) => {
			if (!ts.isObjectLiteralExpression(node)) {
				return;
			}
			const entries: [string, string][] = [];
			for (const property of node.properties) {
				if (
					!(
						ts.isPropertyAssignment(property) &&
						ts.isStringLiteral(property.name) &&
						ts.isStringLiteral(property.initializer) &&
						routeKey.test(property.name.text)
					)
				) {
					return;
				}
				entries.push([property.name.text, property.initializer.text]);
			}
			if (entries.length >= 5) {
				Object.assign(overrides, Object.fromEntries(entries));
			}
		});
	}
	return overrides;
}

function eventNameFor(route: string, overrides: Record<string, string>) {
	const override = overrides[route];
	if (override) {
		return override;
	}
	const [router, method] = route.split(".");
	if (!(router && method)) {
		return route;
	}
	const subject = snake(router.replace(trailingS, ""));
	const verb = verbs[method];
	if (verb) {
		return `${subject}_${verb}`;
	}
	const toggled = method.match(togglePrefix);
	return toggled
		? `${subject}_toggled_${snake(toggled[1] as string)}`
		: `${subject}_${method}`;
}

function trackedRoutes(sources: ReadonlyMap<string, string>) {
	const keys = routerKeys(sources);
	const overrides = nameOverrides(sources);
	const entries: string[] = [];
	for (const [path, source] of sources) {
		if (!routerBinding.test(source)) {
			continue;
		}
		const file = parse(path, source);
		const lines = source.split("\n");
		for (const { name, object } of exportedObjects(file)) {
			const routerKey = keys.get(name);
			if (!routerKey) {
				continue;
			}
			for (const property of object.properties) {
				if (!ts.isPropertyAssignment(property)) {
					continue;
				}
				const method = propertyKey(property.name);
				const base = method ? baseIdentifier(property.initializer) : null;
				if (
					!(base && procedureSuffix.test(base) && trackedProcedure.test(base))
				) {
					continue;
				}
				const start = lineOf(file, property.getStart(file));
				const end = lineOf(file, property.getEnd());
				const props = [
					...new Set(
						[
							...lines
								.slice(start - 1, end)
								.join("\n")
								.matchAll(trackProperties),
						]
							.flatMap((match) => [
								...(match[1] as string).matchAll(propertyName),
							])
							.map((entry) => entry[1] as string)
					),
				];
				const route = `${routerKey}.${method}`;
				entries.push(
					`${route} -> ${eventNameFor(route, overrides)} (${path}:${start}-${end}, ${base}${props.length ? `, props ${props.join("/")}` : ""})`
				);
			}
		}
	}
	return entries;
}

function firedKind(text: string, node: ts.Node) {
	const writesWarehouse = warehouseTable.test(text);
	const fn = ts.isVariableDeclaration(node) ? node.initializer : node;
	const parameters = new Set(
		fn &&
			(ts.isFunctionDeclaration(fn) ||
				ts.isArrowFunction(fn) ||
				ts.isFunctionExpression(fn))
			? fn.parameters
					.map((parameter) => parameter.name)
					.filter(ts.isIdentifier)
					.map((name) => name.text)
			: []
	);
	let kind: "track" | "warehouse" | null = null;
	walk(node, (child) => {
		if (kind === "track" || !ts.isCallExpression(child)) {
			return;
		}
		const callee = child.expression;
		const name = ts.isPropertyAccessExpression(callee)
			? callee.name.text
			: ts.isIdentifier(callee)
				? callee.text
				: null;
		const [event] = child.arguments;
		if (
			name &&
			trackingCallee.test(name) &&
			event &&
			(ts.isStringLiteralLike(event) ||
				ts.isTemplateExpression(event) ||
				ts.isObjectLiteralExpression(event) ||
				ts.isPropertyAccessExpression(event) ||
				ts.isElementAccessExpression(event) ||
				(ts.isIdentifier(event) && parameters.has(event.text)))
		) {
			kind = "track";
		} else if (
			writesWarehouse &&
			(name === "insert" || name === "insertCustomEvent")
		) {
			kind = "warehouse";
		}
	});
	return kind;
}

function topLevelFunctions(file: ts.SourceFile) {
	const found: { name: string; node: ts.Node }[] = [];
	for (const statement of file.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name) {
			found.push({ name: statement.name.text, node: statement });
		} else if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (ts.isIdentifier(declaration.name) && declaration.initializer) {
					found.push({ name: declaration.name.text, node: declaration });
				}
			}
		}
	}
	return found;
}

function trackingDeclarations(sources: ReadonlyMap<string, string>) {
	const helpers: string[] = [];
	const warehouse: string[] = [];
	const writers = new Set<string>();
	for (const [path, source] of sources) {
		if (
			collectorPackage.test(path) ||
			!(
				trackingCall.test(source) ||
				(warehouseTable.test(source) && warehouseInsert.test(source))
			)
		) {
			continue;
		}
		const file = parse(path, source);
		for (const { name, node } of topLevelFunctions(file)) {
			const text = node.getText(file);
			const kind = firedKind(text, node);
			if (!kind) {
				continue;
			}
			const line = lineOf(file, node.getStart(file));
			if (kind === "warehouse") {
				writers.add(name);
				warehouse.push(
					`${name} (${path}:${line}) inserts analytics.custom_events`
				);
				continue;
			}
			const events = [
				...new Set(
					[...text.matchAll(eventLiteral)].map((match) => match[1] as string)
				),
			];
			if (events.length) {
				helpers.push(
					`${name} (${path}:${line}) fires ${events.slice(0, 6).join("/")}`
				);
			} else if (lowerFirst.test(name)) {
				helpers.push(
					`${name} (${path}:${line}) fires the event its caller passes`
				);
			}
		}
	}
	if (writers.size) {
		const names = [...writers].map((name) =>
			name.replace(regexSpecial, "\\$&")
		);
		const caller = new RegExp(`\\b(${names.join("|")})\\s*\\(`);
		for (const [path, source] of sources) {
			if (collectorPackage.test(path) || !caller.test(source)) {
				continue;
			}
			const file = parse(path, source);
			for (const { name, node } of topLevelFunctions(file)) {
				const via = caller.exec(node.getText(file))?.[1];
				if (via && !writers.has(name) && lowerFirst.test(name)) {
					helpers.push(
						`${name} (${path}:${lineOf(file, node.getStart(file))}) records events via ${via}`
					);
				}
			}
		}
	}
	return { helpers, warehouse };
}

export function collectCoverage(sources: ReadonlyMap<string, string>) {
	const attributes: string[] = [];
	const listeners: string[] = [];
	for (const [path, source] of sources) {
		const collector = collectorPackage.test(path);
		let literals: [number, number][] | null = null;
		const inLiteral = (offset: number) => {
			if (!scriptFile.test(path)) {
				return false;
			}
			if (!literals) {
				const found: [number, number][] = [];
				walk(parse(path, source), (node) => {
					if (
						ts.isStringLiteral(node) ||
						ts.isNoSubstitutionTemplateLiteral(node) ||
						ts.isTemplateExpression(node)
					) {
						found.push([node.getStart(), node.end]);
					}
				});
				literals = found;
			}
			return literals.some(([start, end]) => start <= offset && offset < end);
		};
		let offset = 0;
		for (const [index, line] of source.split("\n").entries()) {
			const lineStart = offset;
			offset += line.length + 1;
			const match = line.match(dataTrack);
			if (match) {
				attributes.push(`${path}:${index + 1} data-track="${match[1]}"`);
			}
			const option = collector ? null : attributeOption.exec(line);
			if (
				!(collector || commentLine.test(line)) &&
				((option && !inLiteral(lineStart + option.index)) ||
					attributeSelector.test(line))
			) {
				listeners.push(`${path}:${index + 1}`);
			}
		}
	}
	const { helpers, warehouse } = trackingDeclarations(sources);
	return {
		attributeTracking: [
			...attributes,
			...listeners.map((listener) => `data-track listener at ${listener}`),
		],
		attributeListeners: listeners,
		trackedRoutes: trackedRoutes(sources),
		trackingHelpers: helpers,
		warehouseWrites: warehouse,
	};
}

export const coverageNote =
	"trackedRoutes lists ORPC procedures declared on the tracked middleware: each emits the named event automatically after the handler resolves successfully, with no track() call in the handler, and a caller that awaits that route inherits that coverage. trackingHelpers are first-party functions that call track() internally; calling one is direct coverage. attributeTracking lists data-track attributes and the listeners that emit them: the SDK's trackAttributes option or a delegated [data-track] handler. When a listener is listed, a click on a data-track element or anything inside it emits that event; it records the click, not a later submit, request or payment outcome. warehouseWrites insert analytics rows directly.";
