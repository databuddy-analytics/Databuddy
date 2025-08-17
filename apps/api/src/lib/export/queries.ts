// ClickHouse queries for data export

/**
 * Builds a secure date filter using parameterized queries
 * Returns both the filter string and parameters to prevent SQL injection
 */
export function buildDateFilter(
	startDate?: string,
	endDate?: string
): {
	filter: string;
	params: Record<string, string>;
} {
	const params: Record<string, string> = {};
	const conditions: string[] = [];

	if (startDate) {
		params.startDate = startDate;
		conditions.push('time >= {startDate:String}');
	}

	if (endDate) {
		params.endDate = endDate;
		conditions.push('time <= {endDate:String}');
	}

	const filter = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
	return { filter, params };
}

export function getEventsQuery(dateFilter: string): string {
	return `
		SELECT 
			id,
			client_id,
			event_name,
			anonymous_id,
			toString(time) as time,
			session_id,
			referrer,
			url,
			path,
			title,
			browser_name,
			browser_version,
			os_name,
			os_version,
			device_type,
			device_brand,
			device_model,
			country,
			region,
			city,
			screen_resolution,
			viewport_size,
			language,
			timezone,
			connection_type,
			rtt,
			time_on_page,
			scroll_depth,
			interaction_count,
			exit_intent,
			page_count,
			is_bounce,
			page_size,
			utm_source,
			utm_medium,
			utm_campaign,
			utm_term,
			utm_content,
			load_time,
			dom_ready_time,
			ttfb,
			connection_time,
			request_time,
			render_time,
			fcp,
			lcp,
			cls,
			properties,
			toString(created_at) as created_at
		FROM analytics.events 
		WHERE client_id = {websiteId:String} ${dateFilter}
		ORDER BY time DESC
		LIMIT 100000
	`;
}

export function getErrorsQuery(dateFilter: string): string {
	// Replace 'time' with 'timestamp' for errors table
	const errorDateFilter = dateFilter.replace(/time/g, 'timestamp');
	return `
		SELECT 
			id,
			client_id,
			event_id,
			anonymous_id,
			session_id,
			toString(timestamp) as timestamp,
			path,
			message,
			filename,
			lineno,
			colno,
			stack,
			error_type,
			browser_name,
			browser_version,
			os_name,
			os_version,
			device_type,
			country,
			region,
			toString(created_at) as created_at
		FROM analytics.errors 
		WHERE client_id = {websiteId:String} ${errorDateFilter}
		ORDER BY timestamp DESC
		LIMIT 50000
	`;
}

export function getWebVitalsQuery(dateFilter: string): string {
	// Replace 'time' with 'timestamp' for web_vitals table
	const vitalsDateFilter = dateFilter.replace(/time/g, 'timestamp');
	return `
		SELECT 
			id,
			client_id,
			event_id,
			anonymous_id,
			session_id,
			toString(timestamp) as timestamp,
			path,
			fcp,
			lcp,
			cls,
			fid,
			inp,
			browser_name,
			browser_version,
			os_name,
			os_version,
			device_type,
			country,
			region,
			toString(created_at) as created_at
		FROM analytics.web_vitals 
		WHERE client_id = {websiteId:String} ${vitalsDateFilter}
		ORDER BY timestamp DESC
		LIMIT 25000
	`;
}
