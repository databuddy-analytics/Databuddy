import type { DynamicQueryFilter } from "@/types/api";

export const DASHBOARD_FILTERS_QUERY_PARAM = "filters";

export type DashboardActionParamValue =
	| (boolean | number | string)[]
	| boolean
	| null
	| number
	| string
	| undefined;

export type DashboardActionParams = Record<string, DashboardActionParamValue>;

export const DASHBOARD_ACTION_TARGETS = [
	"global.events",
	"global.events.stream",
	"home",
	"insights",
	"links",
	"websites",
	"website.agent",
	"website.audience",
	"website.dashboard",
	"website.errors",
	"website.event",
	"website.events",
	"website.events.stream",
	"website.flags",
	"website.funnels",
	"website.goals",
	"website.map",
	"website.realtime",
	"website.revenue",
	"website.settings.tracking",
	"website.users",
	"website.vitals",
] as const;

export type DashboardActionTarget = (typeof DASHBOARD_ACTION_TARGETS)[number];

const DASHBOARD_ACTION_TARGET_SET = new Set<string>(DASHBOARD_ACTION_TARGETS);

interface SearchParamsLike {
	get: (name: string) => string | null;
	has: (name: string) => boolean;
}

const BASE_URL = "https://dashboard.databuddy.local";
const MAX_FILTERS = 12;
const MAX_FILTER_VALUE_ITEMS = 20;
const MAX_STRING_LENGTH = 300;
const WEBSITE_PLACEHOLDERS = ["{websiteId}", ":websiteId"] as const;
const PRESERVED_ANALYTICS_PARAMS = [
	"startDate",
	"endDate",
	"granularity",
	DASHBOARD_FILTERS_QUERY_PARAM,
] as const;

const ALLOWED_TOP_LEVEL_SEGMENTS = new Set([
	"billing",
	"events",
	"feedback",
	"home",
	"insights",
	"links",
	"monitors",
	"organizations",
	"settings",
	"websites",
]);

const FILTER_OPERATORS = new Set<DynamicQueryFilter["operator"]>([
	"contains",
	"eq",
	"in",
	"ne",
	"not_contains",
	"not_in",
	"starts_with",
]);

const WEBSITE_TARGET_PATHS = {
	"website.agent": "/agent",
	"website.audience": "/audience",
	"website.dashboard": "",
	"website.errors": "/errors",
	"website.events": "/events",
	"website.events.stream": "/events/stream",
	"website.flags": "/flags",
	"website.funnels": "/funnels",
	"website.goals": "/goals",
	"website.map": "/map",
	"website.realtime": "/realtime",
	"website.revenue": "/revenue",
	"website.settings.tracking": "/settings/tracking",
	"website.users": "/users",
	"website.vitals": "/vitals",
} as const satisfies Partial<Record<DashboardActionTarget, string>>;

const GLOBAL_TARGET_PATHS = {
	"global.events": "/events",
	"global.events.stream": "/events/stream",
	home: "/home",
	insights: "/insights",
	links: "/links",
	websites: "/websites",
} as const satisfies Partial<Record<DashboardActionTarget, string>>;

function isWebsiteTarget(
	target: DashboardActionTarget
): target is keyof typeof WEBSITE_TARGET_PATHS {
	return Object.hasOwn(WEBSITE_TARGET_PATHS, target);
}

function isGlobalTarget(
	target: DashboardActionTarget
): target is keyof typeof GLOBAL_TARGET_PATHS {
	return Object.hasOwn(GLOBAL_TARGET_PATHS, target);
}

function isDashboardActionTarget(
	value: string
): value is DashboardActionTarget {
	return DASHBOARD_ACTION_TARGET_SET.has(value);
}

function hasControlCharacter(value: string) {
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code <= 31 || code === 127) {
			return true;
		}
	}
	return false;
}

function replaceWebsitePlaceholders(input: string, websiteId?: string | null) {
	if (!websiteId) {
		return input;
	}

	return WEBSITE_PLACEHOLDERS.reduce(
		(value, placeholder) =>
			value.replaceAll(placeholder, encodeURIComponent(websiteId)),
		input
	);
}

function resolveDashboardTargetHref({
	eventName,
	target,
	websiteId,
}: {
	eventName?: string;
	target?: string;
	websiteId?: string | null;
}): string | null {
	if (!target) {
		return null;
	}
	if (!isDashboardActionTarget(target)) {
		return null;
	}

	if (target === "website.event") {
		if (!(websiteId && eventName)) {
			return null;
		}
		return `/websites/${encodeURIComponent(websiteId)}/events/${encodeURIComponent(eventName)}`;
	}

	if (isWebsiteTarget(target)) {
		if (!websiteId) {
			return null;
		}
		return `/websites/${encodeURIComponent(websiteId)}${WEBSITE_TARGET_PATHS[target]}`;
	}

	return isGlobalTarget(target) ? GLOBAL_TARGET_PATHS[target] : null;
}

function isSafeDashboardPath(pathname: string) {
	if (!(pathname.startsWith("/") && !pathname.startsWith("//"))) {
		return false;
	}
	if (pathname.includes("\\")) {
		return false;
	}

	const topLevel = pathname.split("/").filter(Boolean)[0];
	return topLevel ? ALLOWED_TOP_LEVEL_SEGMENTS.has(topLevel) : false;
}

export function normalizeDashboardHref(
	href: string,
	websiteId?: string | null
): string | null {
	const replaced = replaceWebsitePlaceholders(href.trim(), websiteId);
	if (
		!replaced ||
		hasControlCharacter(replaced) ||
		WEBSITE_PLACEHOLDERS.some((placeholder) => replaced.includes(placeholder))
	) {
		return null;
	}

	let url: URL;
	try {
		url = new URL(replaced, BASE_URL);
	} catch {
		return null;
	}

	if (url.origin !== BASE_URL || !isSafeDashboardPath(url.pathname)) {
		return null;
	}

	return `${url.pathname}${url.search}${url.hash}`;
}

function normalizeParamValue(value: DashboardActionParamValue): string[] {
	if (value === null || value === undefined) {
		return [];
	}
	if (Array.isArray(value)) {
		return value.map((item) => String(item)).filter(Boolean);
	}
	return [String(value)];
}

function applyActionParams(
	url: URL,
	params: DashboardActionParams | undefined
) {
	if (!params) {
		return;
	}

	for (const [key, rawValue] of Object.entries(params)) {
		if (!key || key === DASHBOARD_FILTERS_QUERY_PARAM) {
			continue;
		}
		const values = normalizeParamValue(rawValue);
		url.searchParams.delete(key);
		for (const value of values) {
			url.searchParams.append(key, value);
		}
	}
}

function preserveAnalyticsParams(
	url: URL,
	currentSearchParams: SearchParamsLike | undefined,
	filters: DynamicQueryFilter[] | undefined
) {
	if (!currentSearchParams) {
		return;
	}

	for (const key of PRESERVED_ANALYTICS_PARAMS) {
		if (key === DASHBOARD_FILTERS_QUERY_PARAM && filters !== undefined) {
			continue;
		}
		if (!(currentSearchParams.has(key) && !url.searchParams.has(key))) {
			continue;
		}
		const value = currentSearchParams.get(key);
		if (value !== null) {
			url.searchParams.set(key, value);
		}
	}
}

export function serializeDashboardFilters(filters: DynamicQueryFilter[]) {
	return JSON.stringify(filters);
}

export function buildDashboardActionHref({
	currentSearchParams,
	currentWebsiteId,
	eventName,
	filters,
	href,
	params,
	preserveAnalyticsContext = true,
	target,
	websiteId,
}: {
	currentSearchParams?: SearchParamsLike;
	currentWebsiteId?: string | null;
	eventName?: string;
	filters?: DynamicQueryFilter[];
	href?: string;
	params?: DashboardActionParams;
	preserveAnalyticsContext?: boolean;
	target?: string;
	websiteId?: string;
}): string | null {
	const resolvedHref =
		resolveDashboardTargetHref({
			eventName,
			target,
			websiteId: websiteId ?? currentWebsiteId,
		}) ?? href;
	if (!resolvedHref) {
		return null;
	}

	const normalizedHref = normalizeDashboardHref(
		resolvedHref,
		websiteId ?? currentWebsiteId
	);
	if (!normalizedHref) {
		return null;
	}

	const url = new URL(normalizedHref, BASE_URL);
	if (preserveAnalyticsContext) {
		preserveAnalyticsParams(url, currentSearchParams, filters);
	}
	applyActionParams(url, params);
	if (filters !== undefined) {
		url.searchParams.set(
			DASHBOARD_FILTERS_QUERY_PARAM,
			serializeDashboardFilters(filters)
		);
	}

	return `${url.pathname}${url.search}${url.hash}`;
}

function isSafeString(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		value.length <= MAX_STRING_LENGTH
	);
}

function isFilterValue(value: unknown): value is DynamicQueryFilter["value"] {
	if (typeof value === "string") {
		return value.length <= MAX_STRING_LENGTH;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (!Array.isArray(value) || value.length > MAX_FILTER_VALUE_ITEMS) {
		return false;
	}
	return value.every(
		(item) =>
			(typeof item === "string" && item.length <= MAX_STRING_LENGTH) ||
			(typeof item === "number" && Number.isFinite(item))
	);
}

function toDashboardFilter(input: unknown): DynamicQueryFilter | null {
	if (typeof input !== "object" || input === null) {
		return null;
	}

	const record = input as Record<string, unknown>;
	if (!(isSafeString(record.field) && isSafeString(record.operator))) {
		return null;
	}
	if (
		!FILTER_OPERATORS.has(record.operator as DynamicQueryFilter["operator"])
	) {
		return null;
	}
	if (!isFilterValue(record.value)) {
		return null;
	}

	return {
		field: record.field,
		operator: record.operator as DynamicQueryFilter["operator"],
		value: record.value,
	};
}

export function parseDashboardFiltersParam(
	rawValue: string | null
): DynamicQueryFilter[] | null {
	if (rawValue === null) {
		return null;
	}
	if (!rawValue.trim()) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawValue);
	} catch {
		return null;
	}

	if (!Array.isArray(parsed) || parsed.length > MAX_FILTERS) {
		return null;
	}

	const filters: DynamicQueryFilter[] = [];
	for (const item of parsed) {
		const filter = toDashboardFilter(item);
		if (!filter) {
			return null;
		}
		filters.push(filter);
	}

	return filters;
}
