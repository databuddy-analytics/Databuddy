// Session types for consistent data structures across the app

export interface SessionEvent {
	event_id: string;
	event_name: string;
	path: string;
	properties: Record<string, unknown>;
	time: string;
}

export interface SessionReferrer {
	domain: string | null;
	name: string;
}

export interface SessionMetrics {
	bounce_rate: number;
	median_session_duration: number;
	total_events: number;
	total_sessions: number;
}

export interface SessionDurationRange {
	duration_range: "0-30s" | "30s-1m" | "1m-5m" | "5m-15m" | "15m-1h" | "1h+";
	sessions: number;
	visitors: number;
}

export interface SessionsByDevice {
	median_session_duration: number;
	name: string;
	sessions: number;
	visitors: number;
}

export interface SessionsByBrowser {
	median_session_duration: number;
	name: string;
	sessions: number;
	visitors: number;
}

export interface SessionTimeSeries {
	date: string;
	median_session_duration: number;
	sessions: number;
	visitors: number;
}

export interface SessionFlow {
	name: string;
	sessions: number;
	visitors: number;
}

export interface Session {
	browser_name: string;
	country: string;
	country_code: string;
	country_name: string;
	device_type: string;
	events: RawSessionEventTuple[] | SessionEvent[];
	first_visit: string;
	is_returning_visitor?: boolean;
	last_visit: string;
	os_name: string;
	page_views: number;
	referrer: string;
	referrer_parsed?: {
		name?: string;
		domain?: string;
	};
	session_id: string;
	session_name?: string;
	visitor_id: string;
	visitor_session_count?: number;
}

export interface SessionListResponse {
	session_list: Session[];
}

export interface SessionsListProps {
	websiteId: string;
}

export interface SessionRowProps {
	index: number;
	isExpanded: boolean;
	onToggle: (sessionId: string) => void;
	session: Session;
}

// Raw ClickHouse tuple format for events (before transformation)
export type RawSessionEventTuple = [
	string, // event_id
	string, // time
	string, // event_name
	string, // path
	string | null, // properties (JSON string)
];

// Raw session data from ClickHouse (before transformation)
export interface RawSession {
	browser_name: string;
	country: string;
	country_code: string;
	country_name: string;
	device_type: string;
	events: RawSessionEventTuple[];
	first_visit: string;
	last_visit: string;
	os_name: string;
	page_views: number;
	referrer: string;
	session_id: string;
	visitor_id: string;
}

// Event icon and styling configuration
export interface EventIconConfig {
	badgeColor: string;
	bgColor: string;
	borderColor: string;
	color: string;
	icon: unknown;
}
