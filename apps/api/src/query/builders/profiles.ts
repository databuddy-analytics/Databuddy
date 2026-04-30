import { Analytics } from "../../types/tables";
import type {
	Filter,
	QueryHelpers,
	SimpleQueryConfig,
	TimeUnit,
} from "../types";

const PROFILE_SORT_FIELDS: Record<string, string> = {
	session_count: "session_count",
	total_events: "total_events",
	last_visit: "last_visit",
	first_visit: "first_visit",
	unique_pages: "unique_pages",
};

const AGGREGATE_FILTER_FIELDS = new Set([
	"session_count",
	"total_events",
	"unique_pages",
]);

const SUBQUERY_FILTER_FIELDS = new Set(["event_name"]);

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
	havingConditions: string[];
	subqueryFilters: Filter[];
	whereConditions: string[];
}

function separateProfileFilters(
	filters?: Filter[],
	filterConditions?: string[]
): SeparatedFilters {
	const whereConditions: string[] = [];
	const havingConditions: string[] = [];
	const subqueryFilters: Filter[] = [];

	for (let i = 0; i < (filterConditions || []).length; i++) {
		const filter = filters?.[i];
		const condition = filterConditions?.[i];
		if (!condition) {
			continue;
		}
		if (filter && SUBQUERY_FILTER_FIELDS.has(filter.field)) {
			subqueryFilters.push(filter);
		} else if (filter && AGGREGATE_FILTER_FIELDS.has(filter.field)) {
			havingConditions.push(condition);
		} else {
			whereConditions.push(condition);
		}
	}

	return { whereConditions, havingConditions, subqueryFilters };
}

function buildEventNameSubquery(filters: Filter[]): {
	clause: string;
	params: Record<string, string>;
} {
	const eventFilter = filters.find((f) => f.field === "event_name");
	if (!eventFilter) {
		return { clause: "", params: {} };
	}

	const value = String(eventFilter.value);
	return {
		clause: `AND anonymous_id IN (
        SELECT DISTINCT anonymous_id
        FROM ${Analytics.custom_events}
        WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
          AND event_name = {eventNameFilter:String}
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})
          AND anonymous_id IS NOT NULL
      )`,
		params: { eventNameFilter: value },
	};
}

const PROFILE_ACTIVITY_CTE = `
      profile_activity AS (
        SELECT
          session_id,
          time
        FROM ${Analytics.events}
        WHERE
          client_id = {websiteId:String}
          AND anonymous_id = {visitorId:String}
          AND time >= toDateTime({startDate:String})
          AND time <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          ifNull(session_id, '') as session_id,
          timestamp as time
        FROM ${Analytics.custom_events}
        WHERE
          website_id = {websiteId:String}
          AND anonymous_id = {visitorId:String}
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          session_id,
          timestamp as time
        FROM ${Analytics.error_spans}
        WHERE
          client_id = {websiteId:String}
          AND anonymous_id = {visitorId:String}
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          session_id,
          timestamp as time
        FROM ${Analytics.web_vitals_spans}
        WHERE
          client_id = {websiteId:String}
          AND anonymous_id = {visitorId:String}
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})

        UNION ALL

        SELECT
          session_id,
          timestamp as time
        FROM ${Analytics.outgoing_links}
        WHERE
          client_id = {websiteId:String}
          AND anonymous_id = {visitorId:String}
          AND timestamp >= toDateTime({startDate:String})
          AND timestamp <= toDateTime({endDate:String})
      )`;

export const ProfilesBuilders: Record<string, SimpleQueryConfig> = {
	profile_list: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			limit?: number,
			offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>,
			_helpers?: QueryHelpers,
			orderBy?: string
		) => {
			const { whereConditions, havingConditions, subqueryFilters } =
				separateProfileFilters(_filters, filterConditions);

			const combinedWhereClause = whereConditions.length
				? `AND ${whereConditions.join(" AND ")}`
				: "";

			const havingClause = havingConditions.length
				? `HAVING ${havingConditions.join(" AND ")}`
				: "";

			const eventSubquery = buildEventNameSubquery(subqueryFilters);

			const profileSort = resolveProfileSort(orderBy);

			return {
				sql: `
    WITH visitor_profiles AS (
      SELECT
        anonymous_id as visitor_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        COUNT(DISTINCT session_id) as session_count,
        COUNT(*) as total_events,
        COUNT(DISTINCT CASE WHEN event_name = 'screen_view' THEN path ELSE NULL END) as unique_pages,
        any(user_agent) as user_agent,
        any(country) as country,
        any(region) as region,
        any(device_type) as device_type,
        any(browser_name) as browser_name,
        any(os_name) as os_name,
        any(referrer) as referrer
      FROM ${Analytics.events}
      WHERE
        client_id = {websiteId:String}
        AND time >= toDateTime({startDate:String})
        AND time <= toDateTime({endDate:String})
	${combinedWhereClause}
	${eventSubquery.clause}
      GROUP BY anonymous_id
      ${havingClause}
      ORDER BY ${profileSort}
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    ),
    visitor_custom_events AS (
      SELECT
        ce.anonymous_id as visitor_id,
        COUNT(*) as custom_event_count,
        COUNT(DISTINCT ce.event_name) as unique_event_names
      FROM ${Analytics.custom_events} ce
      INNER JOIN visitor_profiles vp ON ce.anonymous_id = vp.visitor_id
      WHERE (ce.owner_id = {websiteId:String} OR ce.website_id = {websiteId:String})
        AND ce.timestamp >= toDateTime({startDate:String})
        AND ce.timestamp <= toDateTime({endDate:String})
      GROUP BY ce.anonymous_id
    ),
    visitor_sessions AS (
      SELECT
        vp.visitor_id,
        e.session_id,
        MIN(e.time) as session_start,
        MAX(e.time) as session_end,
        LEAST(dateDiff('second', MIN(e.time), MAX(e.time)), 28800) as duration,
        COUNT(*) as page_views,
        COUNT(DISTINCT CASE WHEN e.event_name = 'screen_view' THEN e.path ELSE NULL END) as unique_pages,
        any(e.user_agent) as user_agent,
        any(e.country) as country,
        any(e.region) as region,
        any(e.device_type) as device_type,
        any(e.browser_name) as browser_name,
        any(e.os_name) as os_name,
        any(e.referrer) as referrer,
        groupArray(
          tuple(
            e.id,
            e.time,
            e.event_name,
            e.path,
            CASE
              WHEN e.event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out')
                AND e.properties IS NOT NULL
                AND e.properties != '{}'
              THEN CAST(e.properties AS String)
              ELSE NULL
            END
          )
        ) as events
      FROM ${Analytics.events} e
      INNER JOIN visitor_profiles vp ON e.anonymous_id = vp.visitor_id
      WHERE e.client_id = {websiteId:String}
	${combinedWhereClause}
      GROUP BY vp.visitor_id, e.session_id
      ORDER BY vp.visitor_id, session_start DESC
    )
    SELECT
      vp.visitor_id AS visitor_id,
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
      COALESCE(vs.session_id, '') as session_id,
      COALESCE(vs.session_start, '') as session_start,
      COALESCE(vs.session_end, '') as session_end,
      COALESCE(vs.duration, 0) as duration,
      COALESCE(vs.page_views, 0) as page_views,
      COALESCE(vs.unique_pages, 0) as session_unique_pages,
      COALESCE(vs.user_agent, '') as session_user_agent,
      COALESCE(vs.country, '') as session_country,
      COALESCE(vs.region, '') as session_region,
      COALESCE(vs.device_type, '') as session_device_type,
      COALESCE(vs.browser_name, '') as session_browser_name,
      COALESCE(vs.os_name, '') as session_os_name,
      COALESCE(vs.referrer, '') as session_referrer,
      COALESCE(vs.events, []) as events
    FROM visitor_profiles vp
    LEFT JOIN visitor_custom_events vce ON vp.visitor_id = vce.visitor_id
    LEFT JOIN visitor_sessions vs ON vp.visitor_id = vs.visitor_id
    ORDER BY vp.${profileSort}, vs.session_start DESC
  `,
				params: {
					websiteId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					limit: limit || 25,
					offset: offset || 0,
					...filterParams,
					...eventSubquery.params,
				},
			};
		},
	},

	profile_detail: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			_filterConditions?: string[],
			_filterParams?: Record<string, Filter["value"]>
		) => {
			const visitorId = filters?.find((f) => f.field === "anonymous_id")?.value;

			if (!visitorId || typeof visitorId !== "string") {
				throw new Error(
					"anonymous_id filter is required for profile_detail query"
				);
			}

			return {
				sql: `
    WITH ${PROFILE_ACTIVITY_CTE},
    activity_stats AS (
      SELECT
        {visitorId:String} as visitor_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        COUNT(DISTINCT session_id) as total_sessions
      FROM profile_activity
      WHERE session_id != ''
    ),
    event_stats AS (
      SELECT
        countIf(event_name = 'screen_view') as total_pageviews,
        SUM(CASE WHEN time_on_page > 0 THEN time_on_page ELSE 0 END) as total_duration,
        formatReadableTimeDelta(SUM(CASE WHEN time_on_page > 0 THEN time_on_page ELSE 0 END)) as total_duration_formatted
      FROM ${Analytics.events}
      WHERE
        client_id = {websiteId:String}
        AND anonymous_id = {visitorId:String}
        AND time >= toDateTime({startDate:String})
        AND time <= toDateTime({endDate:String})
    ),
    profile_context AS (
      SELECT
        any(device_type) as device,
        any(browser_name) as browser,
        any(os_name) as os,
        any(country) as country,
        any(region) as region
      FROM ${Analytics.events}
      WHERE
        client_id = {websiteId:String}
        AND anonymous_id = {visitorId:String}
        AND time >= toDateTime({startDate:String})
        AND time <= toDateTime({endDate:String})
    )
    SELECT
      ast.visitor_id,
      ast.first_visit,
      ast.last_visit,
      ast.total_sessions,
      es.total_pageviews,
      es.total_duration,
      es.total_duration_formatted,
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

	profile_sessions: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			filters?: Filter[],
			_granularity?: TimeUnit,
			limit = 100,
			offset = 0
		) => {
			const visitorId = filters?.find((f) => f.field === "anonymous_id")?.value;

			if (!visitorId || typeof visitorId !== "string") {
				throw new Error(
					"anonymous_id filter is required for profile_sessions query"
				);
			}

			return {
				sql: `
    WITH ${PROFILE_ACTIVITY_CTE},
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
        COUNT(DISTINCT CASE WHEN event_name = 'screen_view' THEN path ELSE NULL END) as unique_pages,
        any(device_type) as device,
        any(browser_name) as browser,
        any(os_name) as os,
        any(country) as country,
        any(region) as region,
        any(referrer) as referrer
      FROM ${Analytics.events} e
      INNER JOIN user_sessions us ON e.session_id = us.session_id
      WHERE
        e.client_id = {websiteId:String}
        AND e.anonymous_id = {visitorId:String}
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
      FROM ${Analytics.events} e
      INNER JOIN user_sessions us ON e.session_id = us.session_id
      WHERE
        e.client_id = {websiteId:String}
        AND e.anonymous_id = {visitorId:String}

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
      FROM ${Analytics.custom_events} ce
      INNER JOIN user_sessions us ON ifNull(ce.session_id, '') = us.session_id
      WHERE
        ce.website_id = {websiteId:String}
        AND ce.anonymous_id = {visitorId:String}

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
        AND es.anonymous_id = {visitorId:String}

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
        AND ol.anonymous_id = {visitorId:String}
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
          AND wv.anonymous_id = {visitorId:String}
        ORDER BY wv.timestamp ASC
      )
      WHERE session_id != ''
      GROUP BY session_id
    )
    SELECT
      us.session_id,
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
