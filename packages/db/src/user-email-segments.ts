export const EMAIL_SEGMENTS = [
	"paying",
	"active_websites",
	"inactive_websites",
	"no_websites",
] as const;

export type EmailSegment = (typeof EMAIL_SEGMENTS)[number];

export interface SegmentUser {
	billingCustomerIds: string[];
	createdAt: string;
	email: string;
	emailVerified: boolean;
	firstName: string | null;
	id: string;
	name: string;
	organizationIds: string[];
}

export interface SegmentWebsite {
	id: string;
	organizationId: string;
}

export interface WebsiteActivity {
	eventsInWindow: number;
	lastEventAt: string | null;
	websiteId: string;
}

export interface SegmentOptions {
	minEvents: number;
}

export interface SegmentedUser {
	activeWebsiteCount: number;
	billingCustomerIds: string[];
	createdAt: string;
	email: string;
	eventsInWindow: number;
	firstName: string;
	lastEventAt: string | null;
	name: string;
	organizationCount: number;
	planIds: string[];
	segment: EmailSegment;
	userId: string;
	websiteCount: number;
}

export type SegmentsByName = Record<EmailSegment, SegmentedUser[]>;

const NAME_PART_SPLIT_RE = /\s+/;

function addToMapSet(
	map: Map<string, Set<string>>,
	key: string,
	value: string
) {
	const existing = map.get(key);
	if (existing) {
		existing.add(value);
		return;
	}
	map.set(key, new Set([value]));
}

function fallbackFirstName(user: SegmentUser): string {
	const firstName = user.firstName?.trim();
	if (firstName) {
		return firstName;
	}

	const namePart = user.name.trim().split(NAME_PART_SPLIT_RE).find(Boolean);
	if (namePart) {
		return namePart;
	}

	return user.email.split("@")[0] || "there";
}

function latestDate(left: string | null, right: string | null): string | null {
	if (!left) {
		return right;
	}
	if (!right) {
		return left;
	}
	return Date.parse(right) > Date.parse(left) ? right : left;
}

function createEmptySegments(): SegmentsByName {
	return {
		paying: [],
		active_websites: [],
		inactive_websites: [],
		no_websites: [],
	};
}

export function segmentUsers(
	users: SegmentUser[],
	websites: SegmentWebsite[],
	activity: WebsiteActivity[],
	paidPlansByCustomerId: Map<string, string>,
	options: SegmentOptions
): SegmentsByName {
	const websiteIdsByOrganizationId = new Map<string, Set<string>>();
	for (const website of websites) {
		addToMapSet(websiteIdsByOrganizationId, website.organizationId, website.id);
	}

	const activityByWebsiteId = new Map(
		activity.map((row) => [row.websiteId, row])
	);
	const out = createEmptySegments();

	for (const user of users) {
		const websiteIds = new Set<string>();
		for (const organizationId of user.organizationIds) {
			const orgWebsiteIds = websiteIdsByOrganizationId.get(organizationId);
			if (!orgWebsiteIds) {
				continue;
			}
			for (const websiteId of orgWebsiteIds) {
				websiteIds.add(websiteId);
			}
		}

		let activeWebsiteCount = 0;
		let eventsInWindow = 0;
		let lastEventAt: string | null = null;

		for (const websiteId of websiteIds) {
			const row = activityByWebsiteId.get(websiteId);
			if (!row) {
				continue;
			}
			eventsInWindow += row.eventsInWindow;
			if (row.eventsInWindow >= options.minEvents) {
				activeWebsiteCount += 1;
			}
			lastEventAt = latestDate(lastEventAt, row.lastEventAt);
		}

		const planIds = [
			...new Set(
				user.billingCustomerIds
					.map((customerId) => paidPlansByCustomerId.get(customerId))
					.filter((planId): planId is string => Boolean(planId))
			),
		].sort();

		const segment: EmailSegment =
			planIds.length > 0
				? "paying"
				: websiteIds.size === 0
					? "no_websites"
					: activeWebsiteCount > 0
						? "active_websites"
						: "inactive_websites";

		out[segment].push({
			activeWebsiteCount,
			billingCustomerIds: [...new Set(user.billingCustomerIds)].sort(),
			createdAt: user.createdAt,
			email: user.email,
			eventsInWindow,
			firstName: fallbackFirstName(user),
			lastEventAt,
			name: user.name,
			organizationCount: new Set(user.organizationIds).size,
			planIds,
			segment,
			userId: user.id,
			websiteCount: websiteIds.size,
		});
	}

	for (const segment of EMAIL_SEGMENTS) {
		out[segment].sort((left, right) => left.email.localeCompare(right.email));
	}

	return out;
}

function csvEscape(value: string | number | null): string {
	const text = value === null ? "" : String(value);
	if (!(text.includes(",") || text.includes('"') || text.includes("\n"))) {
		return text;
	}
	return `"${text.replaceAll('"', '""')}"`;
}

export function segmentRowsToCsv(rows: SegmentedUser[]): string {
	const headers = [
		"segment",
		"email",
		"firstName",
		"name",
		"userId",
		"createdAt",
		"organizationCount",
		"websiteCount",
		"activeWebsiteCount",
		"eventsInWindow",
		"lastEventAt",
		"planIds",
		"billingCustomerIds",
	];

	const lines = rows.map((row) =>
		[
			row.segment,
			row.email,
			row.firstName,
			row.name,
			row.userId,
			row.createdAt,
			row.organizationCount,
			row.websiteCount,
			row.activeWebsiteCount,
			row.eventsInWindow,
			row.lastEventAt,
			row.planIds.join("|"),
			row.billingCustomerIds.join("|"),
		]
			.map(csvEscape)
			.join(",")
	);

	return `${headers.join(",")}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}
