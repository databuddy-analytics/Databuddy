import {
	CUSTOM_EVENTS_VISITOR_KEY,
	revenueLatestCte,
	visitorMatch,
} from "@databuddy/db/clickhouse";
import { Analytics } from "../../types/tables";
import { isFilterFieldAllowed } from "../simple-builder";
import { FilterOperators, type Filter, type SimpleQueryConfig } from "../types";

const PROFILE_SORT_FIELDS: Record<string, string> = {
	session_count: "session_count",
	total_events: "total_events",
	last_visit: "last_visit",
	first_visit: "first_visit",
	unique_pages: "unique_pages",
};

const PROFILE_AGGREGATE_FILTER_FIELDS = [
	"session_count",
	"total_events",
	"unique_pages",
] as const;

const AGGREGATE_FILTER_FIELDS = new Set<string>(
	PROFILE_AGGREGATE_FILTER_FIELDS
);

const PROFILE_AGGREGATE_FILTER_OPERATORS = new Set<Filter["op"]>([
	"eq",
	"ne",
	"in",
	"not_in",
]);

const VISITOR_MATCH = visitorMatch();

const PROFILE_IDENTITY_CTES = `
      visitor_identity_rows AS (
        SELECT
          profile_id,
          anonymous_id,
          session_id,
          time AS identity_time
        FROM ${Analytics.events}
        WHERE
          client_id = {websiteId:String}
          AND profile_id != ''
          AND time >= toDateTime({startDate:String})
          AND time <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          profile_id,
          ifNull(anonymous_id, '') AS anonymous_id,
          ifNull(session_id, '') AS session_id,
          timestamp AS identity_time
        FROM ${Analytics.custom_events}
        WHERE
          (owner_id = {websiteId:String} OR website_id = {websiteId:String})
          AND profile_id != ''
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})
      ),
      visitor_profiles_by_anonymous AS (
        SELECT
          anonymous_id,
          argMin(profile_id, identity_time) AS initial_profile_id
        FROM visitor_identity_rows
        WHERE anonymous_id != ''
        GROUP BY anonymous_id
      ),
      visitor_identity_by_session AS (
        SELECT
          session_id,
          argMin(profile_id, identity_time) AS initial_profile_id
        FROM visitor_identity_rows
        WHERE session_id != ''
        GROUP BY session_id
        HAVING uniqExact(profile_id) = 1
      )`;

const PROFILE_TARGET_IDENTITY_CTES = `
      target_identity_rows AS (
        SELECT
          profile_id,
          anonymous_id,
          session_id,
          time AS identity_time
        FROM ${Analytics.events}
        WHERE
          client_id = {websiteId:String}
          AND (profile_id = {visitorId:String} OR anonymous_id = {visitorId:String})
          AND time >= toDateTime({startDate:String})
          AND time <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          profile_id,
          ifNull(anonymous_id, '') AS anonymous_id,
          ifNull(session_id, '') AS session_id,
          timestamp AS identity_time
        FROM ${Analytics.custom_events}
        WHERE
          (owner_id = {websiteId:String} OR website_id = {websiteId:String})
          AND (profile_id = {visitorId:String} OR anonymous_id = {visitorId:String})
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})
      ),
      target_anonymous_ids AS (
        SELECT
          anonymous_id
        FROM target_identity_rows
        WHERE anonymous_id != ''
        GROUP BY anonymous_id
      ),
      target_session_ids AS (
        SELECT
          session_id
        FROM (
          SELECT
            e.session_id,
            ifNull(e.profile_id, '') AS profile_id
          FROM ${Analytics.events} e
          WHERE
            e.client_id = {websiteId:String}
            AND e.profile_id != ''
            AND e.session_id IN (
              SELECT session_id
              FROM target_identity_rows
              WHERE session_id != ''
            )
            AND e.time >= toDateTime({startDate:String})
            AND e.time <= toDateTime({endDate:String})

          UNION ALL

          SELECT
            ifNull(ce.session_id, '') AS session_id,
            ifNull(ce.profile_id, '') AS profile_id
          FROM ${Analytics.custom_events} ce
          WHERE
            (ce.owner_id = {websiteId:String} OR ce.website_id = {websiteId:String})
            AND ce.profile_id != ''
            AND ifNull(ce.session_id, '') IN (
              SELECT session_id
              FROM target_identity_rows
              WHERE session_id != ''
            )
            AND ce.timestamp >= toDateTime({startDate:String})
            AND ce.timestamp <= toDateTime({endDate:String})
        )
        WHERE session_id != '' AND profile_id != ''
        GROUP BY session_id
        HAVING uniqExact(profile_id) = 1
          AND any(profile_id) = {visitorId:String}
      )`;

const identityJoins = (source: string): string => `
        LEFT JOIN visitor_profiles_by_anonymous direct_profile
          ON ifNull(${source}.anonymous_id, '') = direct_profile.anonymous_id
        LEFT JOIN visitor_identity_by_session session_identity
          ON ifNull(${source}.session_id, '') = session_identity.session_id
        `;

const canonicalProfileExpression = (source: string): string => `coalesce(
        nullIf(${source}.profile_id, ''),
        nullIf(direct_profile.initial_profile_id, ''),
        nullIf(
          if(ifNull(${source}.anonymous_id, '') = '', session_identity.initial_profile_id, ''),
          ''
        )
      )`;

const canonicalVisitorExpression = (source: string): string => `coalesce(
        ${canonicalProfileExpression(source)},
        nullIf(${source}.anonymous_id, ''),
        ''
      )`;

// Explicit profile ids always win. A known anonymous id wins over a session id,
// because session ids can be reused by multiple visitors. Session identity is
// only a fallback for rows that have no anonymous id at all.

const SUBQUERY_FILTER_FIELDS = new Set(["event_name"]);
const PROFILE_LIST_ALLOWED_FILTERS = [
	...PROFILE_AGGREGATE_FILTER_FIELDS,
	"event_name",
	"profile_id",
];
const PROFILE_LIST_FILTER_CONFIG: SimpleQueryConfig = {
	allowedFilters: PROFILE_LIST_ALLOWED_FILTERS,
};

function resolveProfileSort(orderBy?: string): string {
	if (!orderBy) {
		return "last_visit DESC";
	}
	const [field, direction] = orderBy.split(" ");
	const mapped = field ? PROFILE_SORT_FIELDS[field] : undefined;
	if (!mapped) {
		return "last_visit DESC";
	}
	const dir = direction?.toUpperCase() === "ASC" ? "ASC" : "DESC";
	return `${mapped} ${dir}`;
}

interface SeparatedFilters {
	filterParams: Record<string, Filter["value"]>;
	havingConditions: string[];
	subqueryConditions: string[];
	whereConditions: string[];
}

function separateProfileFilters(
	filters?: Filter[],
	filterConditions?: string[],
	filterParams?: Record<string, Filter["value"]>
): SeparatedFilters {
	const whereConditions: string[] = [];
	const havingConditions: string[] = [];
	const subqueryConditions: string[] = [];
	const params = { ...filterParams };
	const filtersForConditions = (filters ?? [])
		.map((filter, index) => ({ filter, index }))
		.filter(
			({ filter }) =>
				!(filter.target || filter.having) &&
				isFilterFieldAllowed(PROFILE_LIST_FILTER_CONFIG, filter.field)
		);

	for (let i = 0; i < (filterConditions || []).length; i++) {
		const matchedFilter = filtersForConditions[i];
		const filter = matchedFilter?.filter;
		const condition = filterConditions?.[i];
		if (!condition) {
			continue;
		}
		if (filter && SUBQUERY_FILTER_FIELDS.has(filter.field)) {
			subqueryConditions.push(condition);
		} else if (filter && AGGREGATE_FILTER_FIELDS.has(filter.field)) {
			const key = `f${matchedFilter.index}`;
			const aggregateFilter = buildProfileAggregateFilter(filter, key);
			havingConditions.push(aggregateFilter.clause);
			Object.assign(params, aggregateFilter.params);
		} else {
			whereConditions.push(condition);
		}
	}

	return {
		filterParams: params,
		havingConditions,
		subqueryConditions,
		whereConditions,
	};
}

function profileAggregateNumber(field: string, value: Filter["value"]): number {
	if (Array.isArray(value)) {
		throw new Error(`${field} filter expects a single numeric value.`);
	}

	if (typeof value === "string" && value.trim() === "") {
		throw new Error(`${field} filter expects a numeric value.`);
	}

	const numberValue = Number(value);
	if (!Number.isFinite(numberValue)) {
		throw new Error(`${field} filter expects a numeric value.`);
	}
	return numberValue;
}

function profileAggregateNumberArray(
	field: string,
	value: Filter["value"]
): number[] {
	const values = Array.isArray(value) ? value : [value];
	const numbers = values.map((item) => profileAggregateNumber(field, item));
	if (numbers.length === 0) {
		throw new Error(`${field} filter expects at least one numeric value.`);
	}
	return numbers;
}

function buildProfileAggregateFilter(
	filter: Filter,
	key: string
): { clause: string; params: Record<string, Filter["value"]> } {
	if (!PROFILE_AGGREGATE_FILTER_OPERATORS.has(filter.op)) {
		throw new Error(
			`${filter.field} filter supports only eq, ne, in, and not_in operators.`
		);
	}

	const operator = FilterOperators[filter.op];
	if (filter.op === "in" || filter.op === "not_in") {
		return {
			clause: `${filter.field} ${operator} {${key}:Array(Float64)}`,
			params: {
				[key]: profileAggregateNumberArray(filter.field, filter.value),
			},
		};
	}

	return {
		clause: `${filter.field} ${operator} {${key}:Float64}`,
		params: {
			[key]: profileAggregateNumber(filter.field, filter.value),
		},
	};
}

function profileActivityCte(
	identityCtes: string,
	limitToVisitor = false
): string {
	const eventVisitorExpression = limitToVisitor
		? "{visitorId:String}"
		: canonicalVisitorExpression("e");
	const customVisitorExpression = limitToVisitor
		? "{visitorId:String}"
		: canonicalVisitorExpression("ce");
	const eventJoins = limitToVisitor ? "" : identityJoins("e");
	const customEventJoins = limitToVisitor ? "" : identityJoins("ce");
	const visitorCondition = limitToVisitor
		? `AND (
            e.profile_id = {visitorId:String}
            OR (
              ifNull(e.profile_id, '') = ''
              AND e.anonymous_id IN (SELECT anonymous_id FROM target_anonymous_ids)
            )
            OR (
              ifNull(e.profile_id, '') = ''
              AND ifNull(e.anonymous_id, '') = ''
              AND e.session_id IN (SELECT session_id FROM target_session_ids)
            )
          )`
		: `AND ${canonicalVisitorExpression("e")} = {visitorId:String}`;
	const customVisitorCondition = limitToVisitor
		? `AND (
            ifNull(ce.profile_id, '') = {visitorId:String}
            OR (
              ifNull(ce.profile_id, '') = ''
              AND ifNull(ce.anonymous_id, '') IN (SELECT anonymous_id FROM target_anonymous_ids)
            )
            OR (
              ifNull(ce.profile_id, '') = ''
              AND ifNull(ce.anonymous_id, '') = ''
              AND ifNull(ce.session_id, '') IN (SELECT session_id FROM target_session_ids)
            )
          )`
		: `AND ${canonicalVisitorExpression("ce")} = {visitorId:String}`;

	return `
      ${identityCtes},
      profile_events AS (
        SELECT
          e.id AS id,
          e.client_id AS client_id,
          e.event_name AS event_name,
          e.anonymous_id AS anonymous_id,
          e.time AS time,
          e.session_id AS session_id,
          e.path AS path,
          e.properties AS properties,
          e.profile_id AS profile_id,
          e.time_on_page AS time_on_page,
          e.user_agent AS user_agent,
          e.browser_name AS browser_name,
          e.os_name AS os_name,
          e.device_type AS device_type,
          e.country AS country,
          e.region AS region,
          e.referrer AS referrer,
          ${eventVisitorExpression} AS visitor_id
        FROM ${Analytics.events} e
        ${eventJoins}
        WHERE
          e.client_id = {websiteId:String}
          AND e.time >= toDateTime({startDate:String})
          AND e.time <= toDateTime({endDate:String})
          ${visitorCondition}
      ),
      profile_custom_events AS (
        SELECT
          ce.owner_id AS owner_id,
          ce.website_id AS website_id,
          ce.timestamp AS timestamp,
          ce.event_name AS event_name,
          ce.properties AS properties,
          ce.anonymous_id AS anonymous_id,
          ce.session_id AS session_id,
          ce.profile_id AS profile_id,
          ce.path AS path,
          ${customVisitorExpression} AS visitor_id
        FROM ${Analytics.custom_events} ce
        ${customEventJoins}
        WHERE
          (ce.owner_id = {websiteId:String} OR ce.website_id = {websiteId:String})
          AND ce.timestamp >= toDateTime({startDate:String})
          AND ce.timestamp <= toDateTime({endDate:String})
          ${customVisitorCondition}
      ),
      visitor_ids AS (
        SELECT DISTINCT anonymous_id
        FROM profile_events
        WHERE visitor_id = {visitorId:String} AND anonymous_id != ''

        UNION DISTINCT

        SELECT DISTINCT ifNull(anonymous_id, '')
        FROM profile_custom_events
        WHERE visitor_id = {visitorId:String} AND ifNull(anonymous_id, '') != ''

        UNION DISTINCT

        SELECT {visitorId:String} as anonymous_id
      ),
      profile_activity AS (
        SELECT
          session_id,
          time
        FROM profile_events
        WHERE
          visitor_id = {visitorId:String}

        UNION ALL

        SELECT
          ifNull(session_id, '') as session_id,
          timestamp as time
        FROM profile_custom_events
        WHERE
          visitor_id = {visitorId:String}

        UNION ALL

        SELECT
          session_id,
          timestamp as time
        FROM ${Analytics.error_spans}
        WHERE
          client_id = {websiteId:String}
          AND anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          session_id,
          timestamp as time
        FROM ${Analytics.web_vitals_spans}
        WHERE
          client_id = {websiteId:String}
          AND anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          session_id,
          timestamp as time
        FROM ${Analytics.outgoing_links}
        WHERE
          client_id = {websiteId:String}
          AND anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})
      )`;
}

function stripePaymentIntentId(alias = ""): string {
	const prefix = alias ? `${alias}.` : "";
	return `if(
  JSONExtractString(${prefix}metadata, 'stripe_payment_intent_id') != '',
  JSONExtractString(${prefix}metadata, 'stripe_payment_intent_id'),
  if(${prefix}provider = 'stripe' AND startsWith(${prefix}transaction_id, 'pi_'), ${prefix}transaction_id, '')
)`;
}

const ATTRIBUTED_REVENUE_VISITOR_KEY =
	"if(attributed_profile_id != '', attributed_profile_id, ifNull(attributed_anonymous_id, ''))";

function stripeProfileContextCtes(visitorPredicate: string): string {
	const paymentIntentId = stripePaymentIntentId();
	return `
    profile_payment_intents AS (
      SELECT DISTINCT
        owner_id,
        ${paymentIntentId} AS payment_intent_id
      FROM ${Analytics.revenue}
      WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
        AND provider = 'stripe'
        AND ${visitorPredicate}
		AND ${paymentIntentId} != ''
    ),
    profile_payment_context AS (
      SELECT
        owner_id,
		${paymentIntentId} AS payment_intent_id,
        argMaxIf(profile_id, synced_at, profile_id != '') AS profile_id,
        argMaxIf(ifNull(anonymous_id, ''), synced_at, ifNull(anonymous_id, '') != '') AS anonymous_id,
        argMaxIf(ifNull(session_id, ''), synced_at, ifNull(session_id, '') != '') AS session_id
      FROM ${Analytics.revenue}
      WHERE provider = 'stripe'
		AND (owner_id, ${paymentIntentId}) IN (
          SELECT owner_id, payment_intent_id FROM profile_payment_intents
        )
      GROUP BY owner_id, payment_intent_id
    )`;
}

function stripeProfileRevenueScope(): string {
	const paymentIntentId = stripePaymentIntentId();
	return `(
		(owner_id = {websiteId:String} OR website_id = {websiteId:String})
		OR (
			provider = 'stripe'
			AND (owner_id, ${paymentIntentId}) IN (
				SELECT owner_id, payment_intent_id FROM profile_payment_intents
			)
		)
	)`;
}

function attributedProfileRevenueCte(latestCte: string): string {
	return `
    profile_revenue_attributed AS (
      SELECT
        r.*,
        coalesce(nullIf(r.profile_id, ''), nullIf(context.profile_id, ''), '') AS attributed_profile_id,
        coalesce(r.anonymous_id, nullIf(context.anonymous_id, '')) AS attributed_anonymous_id,
        coalesce(r.session_id, nullIf(context.session_id, '')) AS attributed_session_id
      FROM ${latestCte} r
      LEFT JOIN profile_payment_context context
        ON context.owner_id = r.owner_id
		AND context.payment_intent_id = ${stripePaymentIntentId("r")}
    )`;
}

export const ProfilesBuilders: Record<string, SimpleQueryConfig> = {
	profile_list: {
		meta: {
			description:
				"List of identified user profiles with visit counts and metadata.",
			category: "Profiles",
			tags: ["profiles", "users", "identified"],
		},
		allowedFilters: PROFILE_LIST_ALLOWED_FILTERS,
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				filters,
				filterConditions,
				filterParams,
				orderBy,
			} = ctx;
			const limit = ctx.limit;
			const offset = ctx.offset;
			const {
				filterParams: profileFilterParams,
				havingConditions,
				subqueryConditions,
				whereConditions,
			} = separateProfileFilters(filters, filterConditions, filterParams);

			const combinedWhereClause = whereConditions.length
				? `AND ${whereConditions.join(" AND ")}`
				: "";

			const havingClause = havingConditions.length
				? `HAVING ${havingConditions.join(" AND ")}`
				: "";

			const eventSubqueryClause = subqueryConditions.length
				? `AND visitor_id IN (
	        SELECT DISTINCT visitor_id
	        FROM profile_custom_events
	        WHERE ${subqueryConditions.join(" AND ")}
	          AND visitor_id != ''
	      )`
				: "";

			const profileSort = resolveProfileSort(orderBy);
			const profileRevenueKeyPredicate = `${CUSTOM_EVENTS_VISITOR_KEY} IN (SELECT visitor_id FROM visitor_profiles)`;

			return {
				sql: `
    WITH ${PROFILE_IDENTITY_CTES},
    profile_events AS (
      SELECT
        e.id AS id,
        e.client_id AS client_id,
        e.event_name AS event_name,
        e.anonymous_id AS anonymous_id,
        e.time AS time,
        e.session_id AS session_id,
        e.path AS path,
        e.properties AS properties,
        ${canonicalProfileExpression("e")} AS profile_id,
        e.user_agent AS user_agent,
        e.browser_name AS browser_name,
        e.os_name AS os_name,
        e.device_type AS device_type,
        e.country AS country,
        e.region AS region,
        e.referrer AS referrer,
        ${canonicalVisitorExpression("e")} AS visitor_id
      FROM ${Analytics.events} e
      ${identityJoins("e")}
      WHERE
        e.client_id = {websiteId:String}
        AND e.time >= toDateTime({startDate:String})
        AND e.time <= toDateTime({endDate:String})
    ),
    profile_custom_events AS (
      SELECT
        ce.owner_id AS owner_id,
        ce.website_id AS website_id,
        ce.timestamp AS timestamp,
        ce.event_name AS event_name,
        ce.properties AS properties,
        ce.anonymous_id AS anonymous_id,
        ce.session_id AS session_id,
        ce.profile_id AS profile_id,
        ce.path AS path,
        ${canonicalVisitorExpression("ce")} AS visitor_id
      FROM ${Analytics.custom_events} ce
      ${identityJoins("ce")}
      WHERE
        (ce.owner_id = {websiteId:String} OR ce.website_id = {websiteId:String})
        AND ce.timestamp >= toDateTime({startDate:String})
        AND ce.timestamp <= toDateTime({endDate:String})
    ),
    all_visitor_profiles AS (
      SELECT
        pe.visitor_id AS visitor_id,
        argMaxIf(pe.profile_id, pe.time, pe.profile_id != '') as latest_profile_id,
        MIN(pe.time) as first_visit,
        MAX(pe.time) as last_visit,
        uniq(pe.session_id) as session_count,
        COUNT(*) as total_events,
        uniqIf(pe.path, pe.event_name = 'screen_view') as unique_pages,
        any(pe.user_agent) as user_agent,
        any(pe.country) as country,
        any(pe.region) as region,
        any(pe.device_type) as device_type,
        any(pe.browser_name) as browser_name,
        any(pe.os_name) as os_name,
        any(pe.referrer) as referrer
      FROM profile_events pe
      WHERE
        pe.visitor_id != ''
	${combinedWhereClause}
	${eventSubqueryClause}
      GROUP BY visitor_id
      ${havingClause}
    ),
    visitor_profiles AS (
      SELECT *
      FROM all_visitor_profiles
      ORDER BY ${profileSort}
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    ),
    visitor_custom_events AS (
      SELECT
        visitor_id,
        COUNT(*) as custom_event_count,
        uniq(event_name) as unique_event_names
      FROM profile_custom_events
      WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
        AND visitor_id IN (SELECT visitor_id FROM visitor_profiles)
      GROUP BY visitor_id
    ),
		${stripeProfileContextCtes(profileRevenueKeyPredicate)},
		${revenueLatestCte({
			candidateWhere: `(
				${profileRevenueKeyPredicate}
				OR (owner_id, ${stripePaymentIntentId()}) IN (
					SELECT owner_id, payment_intent_id FROM profile_payment_intents
				)
			)`,
			name: "profile_revenue_latest",
			scope: stripeProfileRevenueScope(),
		})},
		${attributedProfileRevenueCte("profile_revenue_latest")},
    visitor_revenue AS (
      SELECT
		${ATTRIBUTED_REVENUE_VISITOR_KEY} as visitor_id,
		toFloat64(sumIf(amount, status IN ('completed', 'refunded') AND type != 'subscription_event')) as ltv
			FROM profile_revenue_attributed
			WHERE ${ATTRIBUTED_REVENUE_VISITOR_KEY} IN (SELECT visitor_id FROM visitor_profiles)
	      GROUP BY visitor_id
    )
    SELECT
      vp.visitor_id AS visitor_id,
      vp.latest_profile_id AS profile_id,
      vp.first_visit AS first_visit,
      vp.last_visit AS last_visit,
      vp.session_count AS session_count,
      vp.total_events AS total_events,
      vp.unique_pages AS unique_pages,
      vp.user_agent AS user_agent,
      vp.country AS country,
      vp.region AS region,
      vp.device_type AS device_type,
      vp.browser_name AS browser_name,
      vp.os_name AS os_name,
      vp.referrer AS referrer,
      COALESCE(vce.custom_event_count, 0) as custom_event_count,
      COALESCE(vce.unique_event_names, 0) as unique_event_names,
      COALESCE(vr.ltv, 0) as ltv
    FROM visitor_profiles vp
    LEFT JOIN visitor_custom_events vce ON vp.visitor_id = vce.visitor_id
    LEFT JOIN visitor_revenue vr ON vp.visitor_id = vr.visitor_id
    ORDER BY vp.${profileSort}
  `,
				params: {
					websiteId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					limit: limit || 25,
					offset: offset || 0,
					...profileFilterParams,
				},
			};
		},
	},

	profile_detail: {
		meta: {
			description:
				"Detailed profile information for a specific identified user, based on analytics, custom, error, vital, and link activity.",
			category: "Profiles",
			tags: ["profiles", "users", "detail"],
		},
		allowedFilters: ["anonymous_id"],
		requiredFilters: ["anonymous_id"],
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filters } = ctx;
			const visitorId = filters?.find((f) => f.field === "anonymous_id")?.value;

			if (!visitorId || typeof visitorId !== "string") {
				throw new Error(
					"anonymous_id filter is required for profile_detail query"
				);
			}

			return {
				sql: `
	    WITH ${profileActivityCte(PROFILE_TARGET_IDENTITY_CTES, true)},
    activity_stats AS (
      SELECT
        {visitorId:String} as visitor_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        uniq(session_id) as total_sessions
      FROM profile_activity
      WHERE session_id != ''
    ),
	    event_stats AS (
      SELECT
        countIf(event_name = 'screen_view') as total_pageviews,
        SUM(CASE WHEN time_on_page > 0 THEN time_on_page ELSE 0 END) as total_duration,
        formatReadableTimeDelta(SUM(CASE WHEN time_on_page > 0 THEN time_on_page ELSE 0 END)) as total_duration_formatted
	      FROM profile_events
	      WHERE visitor_id = {visitorId:String}
	    ),
    profile_context AS (
      SELECT
        argMaxIf(profile_id, time, profile_id != '') as latest_profile_id,
        any(device_type) as device,
        any(browser_name) as browser,
        any(os_name) as os,
        any(country) as country,
        any(region) as region
	      FROM profile_events
	      WHERE visitor_id = {visitorId:String}
    )
    SELECT
      ast.visitor_id,
      ast.first_visit,
      ast.last_visit,
      ast.total_sessions,
      es.total_pageviews,
      es.total_duration,
      es.total_duration_formatted,
      pc.latest_profile_id AS profile_id,
      pc.device,
      pc.browser,
      pc.os,
      pc.country,
      pc.region
    FROM activity_stats ast
    CROSS JOIN event_stats es
    CROSS JOIN profile_context pc
    WHERE ast.total_sessions > 0
  `,
				params: {
					websiteId,
					visitorId,
					startDate,
					endDate: `${endDate} 23:59:59`,
				},
			};
		},
	},

	profile_revenue: {
		meta: {
			description:
				"Revenue transactions attributed to a user profile via profile id, device set, or session stitching.",
			category: "Profiles",
			tags: ["profiles", "revenue", "transactions"],
		},
		allowedFilters: ["anonymous_id"],
		requiredFilters: ["anonymous_id"],
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filters } = ctx;
			const limit = ctx.limit ?? 50;
			const offset = ctx.offset ?? 0;
			const visitorId = filters?.find((f) => f.field === "anonymous_id")?.value;

			if (!visitorId || typeof visitorId !== "string") {
				throw new Error(
					"anonymous_id filter is required for profile_revenue query"
				);
			}

			return {
				sql: `
    WITH visitor_ids AS (
      SELECT DISTINCT anonymous_id
      FROM ${Analytics.events}
      WHERE
        client_id = {websiteId:String}
        AND ${VISITOR_MATCH}
        AND time >= toDateTime({startDate:String})
        AND time <= toDateTime({endDate:String})

      UNION DISTINCT

      SELECT {visitorId:String} as anonymous_id
    ),
    visitor_sessions AS (
      SELECT DISTINCT session_id
      FROM ${Analytics.events}
      WHERE
        client_id = {websiteId:String}
        AND ${VISITOR_MATCH}
        AND time >= toDateTime({startDate:String})
        AND time <= toDateTime({endDate:String})
        AND session_id != ''
	),
	${stripeProfileContextCtes(`(
		${VISITOR_MATCH}
		OR anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
		OR session_id IN (SELECT session_id FROM visitor_sessions)
	)`)},
	${revenueLatestCte({
		candidateWhere: `created >= toDateTime({startDate:String})
			AND created <= toDateTime({endDate:String})`,
		name: "profile_revenue_latest",
		scope: stripeProfileRevenueScope(),
	})},
	${attributedProfileRevenueCte("profile_revenue_latest")}
    SELECT
      transaction_id,
      provider,
      type,
      status,
      toFloat64(amount) as amount,
      currency,
      ifNull(product_name, '') as product_name,
      created
	FROM profile_revenue_attributed
	WHERE type != 'subscription_event'
      AND created >= toDateTime({startDate:String})
      AND created <= toDateTime({endDate:String})
      AND (
		attributed_profile_id = {visitorId:String}
		OR attributed_anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
		OR attributed_session_id IN (SELECT session_id FROM visitor_sessions)
      )
    ORDER BY created DESC
    LIMIT {limit:Int32} OFFSET {offset:Int32}
  `,
				params: {
					websiteId,
					visitorId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					limit,
					offset,
				},
			};
		},
	},

	profile_sessions: {
		meta: {
			description:
				"Session history for a user profile, including analytics events, custom events, errors, outgoing links, and separate web vitals context.",
			category: "Profiles",
			tags: ["profiles", "sessions", "history"],
		},
		allowedFilters: ["anonymous_id"],
		requiredFilters: ["anonymous_id"],
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filters } = ctx;
			const limit = ctx.limit ?? 100;
			const offset = ctx.offset ?? 0;
			const visitorId = filters?.find((f) => f.field === "anonymous_id")?.value;

			if (!visitorId || typeof visitorId !== "string") {
				throw new Error(
					"anonymous_id filter is required for profile_sessions query"
				);
			}

			return {
				sql: `
	    WITH ${profileActivityCte(PROFILE_TARGET_IDENTITY_CTES, true)},
    user_sessions AS (
      SELECT
        session_id,
        CONCAT('Session ', ROW_NUMBER() OVER (ORDER BY MIN(time))) as session_name,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        LEAST(dateDiff('second', MIN(time), MAX(time)), 28800) as duration,
        formatReadableTimeDelta(LEAST(dateDiff('second', MIN(time), MAX(time)), 28800)) as duration_formatted
      FROM profile_activity
      WHERE session_id != ''
      GROUP BY session_id
      ORDER BY first_visit DESC
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    ),
    session_context AS (
      SELECT
        e.session_id,
        countIf(event_name = 'screen_view') as page_views,
        uniqIf(path, event_name = 'screen_view') as unique_pages,
        any(device_type) as device,
        any(browser_name) as browser,
        any(os_name) as os,
        any(country) as country,
        any(region) as region,
        any(referrer) as referrer
	      FROM profile_events e
	      INNER JOIN user_sessions us ON e.session_id = us.session_id
	      WHERE e.visitor_id = {visitorId:String}
      GROUP BY e.session_id
    ),
    all_events AS (
      SELECT
        toString(e.id) as id,
        e.session_id,
        e.time,
        e.event_name,
        e.path,
        CASE
          WHEN e.event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out')
            AND e.properties IS NOT NULL
            AND e.properties != '{}'
          THEN CAST(e.properties AS Nullable(String))
          ELSE NULL
        END as properties,
        CASE
          WHEN e.event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out') THEN 'custom'
          ELSE 'analytics'
        END as source
	      FROM profile_events e
	      INNER JOIN user_sessions us ON e.session_id = us.session_id
	      WHERE e.visitor_id = {visitorId:String}

      UNION ALL

      SELECT
        concat('custom:', toString(cityHash64(concat(
          ifNull(ce.session_id, ''),
          toString(ce.timestamp),
          ce.event_name,
          ce.properties
        )))) as id,
        ifNull(ce.session_id, '') as session_id,
        ce.timestamp as time,
        ce.event_name,
        ifNull(ce.path, '') as path,
        CASE
          WHEN ce.properties != '{}' THEN CAST(ce.properties AS Nullable(String))
          ELSE NULL
        END as properties,
        'custom' as source
	      FROM profile_custom_events ce
	      INNER JOIN user_sessions us ON ifNull(ce.session_id, '') = us.session_id
	      WHERE ce.visitor_id = {visitorId:String}

      UNION ALL

      SELECT
        concat('error:', toString(cityHash64(concat(
          es.session_id,
          toString(es.timestamp),
          es.error_type,
          es.message
        )))) as id,
        es.session_id,
        es.timestamp as time,
        es.error_type as event_name,
        es.path,
        toJSONString(map(
          'message', es.message,
          'filename', ifNull(es.filename, ''),
          'line', ifNull(toString(es.lineno), ''),
          'column', ifNull(toString(es.colno), '')
        )) as properties,
        'error' as source
      FROM ${Analytics.error_spans} es
      INNER JOIN user_sessions us ON es.session_id = us.session_id
      WHERE
        es.client_id = {websiteId:String}
        AND es.anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
        AND es.timestamp >= toDateTime({startDate:String})
        AND es.timestamp <= toDateTime({endDate:String})

      UNION ALL

      SELECT
        toString(ol.id) as id,
        ol.session_id,
        ol.timestamp as time,
        'outgoing_link' as event_name,
        ol.href as path,
        toJSONString(map(
          'href', ol.href,
          'text', ifNull(ol.text, '')
        )) as properties,
        'outgoing_link' as source
      FROM ${Analytics.outgoing_links} ol
      INNER JOIN user_sessions us ON ol.session_id = us.session_id
      WHERE
        ol.client_id = {websiteId:String}
        AND ol.anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
        AND ol.timestamp >= toDateTime({startDate:String})
        AND ol.timestamp <= toDateTime({endDate:String})
    ),
    session_events AS (
      SELECT
        session_id,
        groupArray(tuple(id, time, event_name, path, properties, source)) as events
      FROM (
        SELECT *
        FROM all_events
        WHERE session_id != ''
        ORDER BY time ASC
      )
      GROUP BY session_id
    ),
    session_vitals AS (
      SELECT
        session_id,
        groupArray(tuple(metric_name, metric_value, time, path)) as web_vitals
      FROM (
        SELECT
          wv.session_id,
          wv.metric_name,
          round(wv.metric_value, 3) as metric_value,
          wv.timestamp as time,
          wv.path
        FROM ${Analytics.web_vitals_spans} wv
        INNER JOIN user_sessions us ON wv.session_id = us.session_id
        WHERE
          wv.client_id = {websiteId:String}
          AND wv.anonymous_id IN (SELECT anonymous_id FROM visitor_ids)
          AND wv.timestamp >= toDateTime({startDate:String})
          AND wv.timestamp <= toDateTime({endDate:String})
        ORDER BY wv.timestamp ASC
      )
      WHERE session_id != ''
      GROUP BY session_id
    )
    SELECT
      us.session_id AS session_id,
      us.session_name,
      us.first_visit,
      us.last_visit,
      us.duration,
      us.duration_formatted,
      COALESCE(sc.page_views, 0) as page_views,
      COALESCE(sc.unique_pages, 0) as unique_pages,
      COALESCE(sc.device, '') as device,
      COALESCE(sc.browser, '') as browser,
      COALESCE(sc.os, '') as os,
      COALESCE(sc.country, '') as country,
      COALESCE(sc.region, '') as region,
      COALESCE(sc.referrer, '') as referrer,
      COALESCE(se.events, []) as events,
      COALESCE(sv.web_vitals, []) as web_vitals
    FROM user_sessions us
    LEFT JOIN session_context sc ON us.session_id = sc.session_id
    LEFT JOIN session_events se ON us.session_id = se.session_id
    LEFT JOIN session_vitals sv ON us.session_id = sv.session_id
    ORDER BY us.first_visit DESC
  `,
				params: {
					websiteId,
					visitorId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					limit,
					offset,
				},
			};
		},
		plugins: {
			normalizeGeo: true,
		},
	},
};
