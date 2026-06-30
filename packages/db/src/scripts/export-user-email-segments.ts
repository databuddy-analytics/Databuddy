import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { chQuery } from "../clickhouse";
import { db, shutdownPostgres } from "../client";
import { member, user, websites } from "../drizzle/schema";
import {
	EMAIL_SEGMENTS,
	type SegmentUser,
	type SegmentWebsite,
	type SegmentedUser,
	type WebsiteActivity,
	segmentRowsToCsv,
	segmentUsers,
} from "../user-email-segments";

const AUTUMN_API_VERSION = "1.2";
const AUTUMN_API_URL = "https://api.useautumn.com/v1";
const ACTIVE_PRODUCT_STATUSES = new Set(["active", "trialing", "past_due"]);
const PAID_CUSTOMER_HEADER_RE = /^customer[_ -]?id\b/i;
const PAID_CUSTOMER_SEPARATOR_RE = /[\t,]/;
const LINE_SPLIT_RE = /\r?\n/;

interface CliOptions {
	activeDays: number;
	includeUnverified: boolean;
	minEvents: number;
	outputDir: string;
	paidCustomerIdsPath: string | null;
	skipAutumn: boolean;
}

interface AutumnCustomerListResponse {
	limit: number;
	list: unknown[];
	offset: number;
	total: number;
}

interface ExportSummary {
	activeDays: number;
	generatedAt: string;
	includeUnverified: boolean;
	minEvents: number;
	paidCustomerCount: number;
	segments: Record<
		string,
		{
			count: number;
			file: string;
		}
	>;
	warnings: string[];
}

function parsePositiveInteger(value: string, name: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!(Number.isFinite(parsed) && parsed > 0)) {
		throw new Error(`${name} must be a positive integer`);
	}
	return parsed;
}

function optionValue(arg: string, name: string): string | null {
	const prefix = `${name}=`;
	if (!arg.startsWith(prefix)) {
		return null;
	}
	return arg.slice(prefix.length);
}

function readCliOptions(argv: string[]): CliOptions {
	const options: CliOptions = {
		activeDays: 30,
		includeUnverified: false,
		minEvents: 1,
		outputDir: "tmp/email-segments",
		paidCustomerIdsPath: null,
		skipAutumn: false,
	};

	for (const arg of argv) {
		if (arg === "--include-unverified") {
			options.includeUnverified = true;
			continue;
		}
		if (arg === "--skip-autumn") {
			options.skipAutumn = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}

		const activeDays = optionValue(arg, "--active-days");
		if (activeDays !== null) {
			options.activeDays = parsePositiveInteger(activeDays, "--active-days");
			continue;
		}

		const minEvents = optionValue(arg, "--min-events");
		if (minEvents !== null) {
			options.minEvents = parsePositiveInteger(minEvents, "--min-events");
			continue;
		}

		const outputDir = optionValue(arg, "--output-dir");
		if (outputDir !== null) {
			options.outputDir = outputDir;
			continue;
		}

		const paidCustomerIdsPath = optionValue(arg, "--paid-customer-ids");
		if (paidCustomerIdsPath !== null) {
			options.paidCustomerIdsPath = paidCustomerIdsPath;
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return options;
}

function printHelp() {
	console.log(`Export user email segments.

Usage:
  bun run email:segments [options]

Options:
  --active-days=N              Recent screen_view window. Default: 30
  --min-events=N               Minimum recent screen_view events for active. Default: 1
  --output-dir=PATH            Directory for CSV output. Default: tmp/email-segments
  --paid-customer-ids=PATH     Optional newline/CSV file of paid customer IDs
  --include-unverified         Include users whose email is not verified
  --skip-autumn                Do not fetch paid customers from Autumn
`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
	return value === true;
}

function isoString(value: Date | string): string {
	return value instanceof Date ? value.toISOString() : value;
}

async function loadUsers(includeUnverified: boolean): Promise<SegmentUser[]> {
	const filters = [isNull(user.deletedAt), eq(user.status, "ACTIVE")];
	if (!includeUnverified) {
		filters.push(eq(user.emailVerified, true));
	}

	const [rows, ownerRows] = await Promise.all([
		db
			.select({
				createdAt: user.createdAt,
				email: user.email,
				emailVerified: user.emailVerified,
				firstName: user.firstName,
				id: user.id,
				name: user.name,
				organizationId: member.organizationId,
			})
			.from(user)
			.leftJoin(member, eq(member.userId, user.id))
			.where(and(...filters)),
		db
			.select({
				organizationId: member.organizationId,
				userId: member.userId,
			})
			.from(member)
			.where(eq(member.role, "owner")),
	]);

	const ownerByOrganizationId = new Map(
		ownerRows.map((row) => [row.organizationId, row.userId])
	);
	const usersById = new Map<
		string,
		Omit<SegmentUser, "billingCustomerIds" | "organizationIds"> & {
			billingCustomerIds: Set<string>;
			organizationIds: Set<string>;
		}
	>();

	for (const row of rows) {
		const existing = usersById.get(row.id);
		const current = existing ?? {
			billingCustomerIds: new Set([row.id]),
			createdAt: isoString(row.createdAt),
			email: row.email,
			emailVerified: row.emailVerified,
			firstName: row.firstName,
			id: row.id,
			name: row.name,
			organizationIds: new Set<string>(),
		};

		if (row.organizationId) {
			current.organizationIds.add(row.organizationId);
			const ownerId = ownerByOrganizationId.get(row.organizationId);
			if (ownerId) {
				current.billingCustomerIds.add(ownerId);
			}
		}

		usersById.set(row.id, current);
	}

	return [...usersById.values()].map((row) => ({
		...row,
		billingCustomerIds: [...row.billingCustomerIds],
		organizationIds: [...row.organizationIds],
	}));
}

function loadWebsites(): Promise<SegmentWebsite[]> {
	return db
		.select({
			id: websites.id,
			organizationId: websites.organizationId,
		})
		.from(websites)
		.where(isNull(websites.deletedAt));
}

async function loadWebsiteActivity(
	websiteIds: string[],
	activeDays: number
): Promise<WebsiteActivity[]> {
	if (websiteIds.length === 0) {
		return [];
	}

	const activeSince = new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000);
	const rows = await chQuery<{
		eventsInWindow: number;
		lastEventAt: string | null;
		websiteId: string;
	}>(
		`SELECT
			client_id AS websiteId,
			count() AS eventsInWindow,
			toString(max(time)) AS lastEventAt
		FROM analytics.events
		PREWHERE time >= parseDateTime64BestEffort({activeSince:String})
			AND client_id IN {websiteIds:Array(String)}
		WHERE event_name = 'screen_view'
		GROUP BY client_id`,
		{
			activeSince: activeSince.toISOString(),
			websiteIds,
		},
		{ readonly: true }
	);

	return rows.map((row) => ({
		eventsInWindow: row.eventsInWindow,
		lastEventAt: row.lastEventAt,
		websiteId: row.websiteId,
	}));
}

function planIdFromProduct(product: Record<string, unknown>): string | null {
	const id = readString(product.id) ?? readString(product.planId);
	const status = readString(product.status)?.toLowerCase();
	const isAddOn = readBoolean(product.is_add_on) || readBoolean(product.addOn);
	const isDefault = readBoolean(product.is_default);

	if (!(id && status && ACTIVE_PRODUCT_STATUSES.has(status))) {
		return null;
	}
	if (isAddOn || isDefault || id.toLowerCase() === "free") {
		return null;
	}
	return id.toLowerCase();
}

function paidPlanFromCustomer(customer: unknown): string | null {
	if (!isRecord(customer)) {
		return null;
	}
	const products = Array.isArray(customer.products)
		? customer.products
		: Array.isArray(customer.subscriptions)
			? customer.subscriptions
			: [];

	for (const product of products) {
		if (!isRecord(product)) {
			continue;
		}
		const planId = planIdFromProduct(product);
		if (planId) {
			return planId;
		}
	}
	return null;
}

function customerIdFromCustomer(customer: unknown): string | null {
	if (!isRecord(customer)) {
		return null;
	}
	return readString(customer.id);
}

function parseAutumnCustomerList(value: unknown): AutumnCustomerListResponse {
	if (!(isRecord(value) && Array.isArray(value.list))) {
		throw new Error("Unexpected Autumn customers response");
	}
	const total =
		typeof value.total_filtered_count === "number"
			? value.total_filtered_count
			: typeof value.total_count === "number"
				? value.total_count
				: typeof value.total === "number"
					? value.total
					: value.list.length;

	return {
		limit: typeof value.limit === "number" ? value.limit : value.list.length,
		list: value.list,
		offset: typeof value.offset === "number" ? value.offset : 0,
		total,
	};
}

async function fetchAutumnPaidCustomerPlans(): Promise<Map<string, string>> {
	const secretKey = process.env.AUTUMN_SECRET_KEY;
	if (!secretKey) {
		return new Map();
	}

	const plans = new Map<string, string>();
	const limit = 100;
	let offset = 0;
	let total = Number.POSITIVE_INFINITY;

	while (offset < total) {
		const url = new URL(`${AUTUMN_API_URL}/customers`);
		url.searchParams.set("limit", String(limit));
		url.searchParams.set("offset", String(offset));

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${secretKey}`,
				"Content-Type": "application/json",
				"x-api-version": AUTUMN_API_VERSION,
			},
		});

		if (!response.ok) {
			throw new Error(`Autumn customers request failed: ${response.status}`);
		}

		const payload = parseAutumnCustomerList(await response.json());
		for (const customer of payload.list) {
			const customerId = customerIdFromCustomer(customer);
			const planId = paidPlanFromCustomer(customer);
			if (customerId && planId) {
				plans.set(customerId, planId);
			}
		}

		if (payload.list.length === 0) {
			break;
		}
		total = payload.total;
		offset = payload.offset + payload.limit;
	}

	return plans;
}

function parsePaidCustomerLine(line: string): [string, string] | null {
	const trimmed = line.trim();
	if (!(trimmed && !trimmed.startsWith("#"))) {
		return null;
	}
	if (PAID_CUSTOMER_HEADER_RE.test(trimmed)) {
		return null;
	}

	const [customerId, planId] = trimmed
		.split(PAID_CUSTOMER_SEPARATOR_RE)
		.map((part) => part.trim());
	if (!customerId) {
		return null;
	}
	return [customerId, planId || "paid"];
}

async function readPaidCustomerPlansFromFile(
	filePath: string
): Promise<Map<string, string>> {
	const resolvedPath = path.resolve(filePath);
	const file = await readFile(resolvedPath, "utf8").catch(() => null);
	if (file === null) {
		throw new Error(`Paid customer file not found: ${filePath}`);
	}

	const rows = file
		.split(LINE_SPLIT_RE)
		.map(parsePaidCustomerLine)
		.filter((row): row is [string, string] => Boolean(row));

	return new Map(rows);
}

async function loadPaidCustomerPlans(
	options: CliOptions,
	warnings: string[]
): Promise<Map<string, string>> {
	const plans = new Map<string, string>();

	if (options.paidCustomerIdsPath) {
		for (const [customerId, planId] of await readPaidCustomerPlansFromFile(
			options.paidCustomerIdsPath
		)) {
			plans.set(customerId, planId);
		}
	}

	if (!options.skipAutumn && process.env.AUTUMN_SECRET_KEY) {
		for (const [customerId, planId] of await fetchAutumnPaidCustomerPlans()) {
			plans.set(customerId, planId);
		}
	}

	if (plans.size === 0) {
		warnings.push(
			"No paid customer source was loaded; paying.csv will be empty unless paid IDs are supplied."
		);
	}

	if (!(options.skipAutumn || process.env.AUTUMN_SECRET_KEY)) {
		warnings.push(
			"AUTUMN_SECRET_KEY is not set; pass --paid-customer-ids=PATH or run with billing env loaded for paying users."
		);
	}

	return plans;
}

function segmentFileName(segment: string): string {
	return `${segment.replaceAll("_", "-")}.csv`;
}

async function writeSegments(
	outputDir: string,
	segments: Record<string, SegmentedUser[]>,
	summary: ExportSummary
) {
	await mkdir(outputDir, { recursive: true });

	for (const segment of EMAIL_SEGMENTS) {
		const fileName = segmentFileName(segment);
		await writeFile(
			path.join(outputDir, fileName),
			segmentRowsToCsv(segments[segment])
		);
		summary.segments[segment] = {
			count: segments[segment].length,
			file: fileName,
		};
	}

	await writeFile(
		path.join(outputDir, "summary.json"),
		`${JSON.stringify(summary, null, 2)}\n`
	);
}

async function main() {
	const options = readCliOptions(process.argv.slice(2));
	const outputDir = path.resolve(options.outputDir);
	const warnings: string[] = [];

	try {
		const [users, sites, paidPlans] = await Promise.all([
			loadUsers(options.includeUnverified),
			loadWebsites(),
			loadPaidCustomerPlans(options, warnings),
		]);
		const activity = await loadWebsiteActivity(
			sites.map((site) => site.id),
			options.activeDays
		);
		const segments = segmentUsers(users, sites, activity, paidPlans, {
			minEvents: options.minEvents,
		});
		const summary: ExportSummary = {
			activeDays: options.activeDays,
			generatedAt: new Date().toISOString(),
			includeUnverified: options.includeUnverified,
			minEvents: options.minEvents,
			paidCustomerCount: paidPlans.size,
			segments: {},
			warnings,
		};

		await writeSegments(outputDir, segments, summary);

		console.log(`Wrote email segments to ${outputDir}`);
		for (const segment of EMAIL_SEGMENTS) {
			console.log(`${segment}: ${segments[segment].length}`);
		}
		for (const warning of warnings) {
			console.warn(`Warning: ${warning}`);
		}
	} finally {
		await shutdownPostgres();
	}
}

if (import.meta.main) {
	await main();
}
