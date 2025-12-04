// Session types for consistent data structures across the app

export interface SessionEvent {
	event_id: string;
	time: string;
	event_name: string;
	path: string;
	properties: Record<string, unknown>;
}

export interface SessionReferrer {
	name: string;
	domain: string | null;
}

export interface SessionMetrics {
	total_sessions: number;
	median_session_duration: number;
	bounce_rate: number;
	total_events: number;
}

export interface SessionDurationRange {
	duration_range: "0-30s" | "30s-1m" | "1m-5m" | "5m-15m" | "15m-1h" | "1h+";
	sessions: number;
	visitors: number;
}

export interface SessionsByDevice {
	name: string;
	sessions: number;
	visitors: number;
	median_session_duration: number;
}

export interface SessionsByBrowser {
	name: string;
	sessions: number;
	visitors: number;
	median_session_duration: number;
}

export interface SessionTimeSeries {
	date: string;
	sessions: number;
	visitors: number;
	median_session_duration: number;
}

export interface SessionFlow {
	name: string;
	sessions: number;
	visitors: number;
}

export interface Session {
	session_id: string;
	first_visit: string;
	last_visit: string;
	page_views: number;
	visitor_id: string;
	country: string;
	country_name: string;
	country_code: string;
	referrer: string;
	device_type: string;
	browser_name: string;
	os_name: string;
	events: RawSessionEventTuple[] | SessionEvent[];
	session_name?: string;
	is_returning_visitor?: boolean;
	visitor_session_count?: number;
	referrer_parsed?: {
		name?: string;
		domain?: string;
	};
}

export interface SessionListResponse {
	session_list: Session[];
}

export interface SessionsListProps {
	websiteId: string;
}

export interface SessionRowProps {
	session: Session;
	index: number;
	isExpanded: boolean;
	onToggle: (sessionId: string) => void;
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
	session_id: string;
	first_visit: string;
	last_visit: string;
	page_views: number;
	visitor_id: string;
	country: string;
	country_code: string;
	country_name: string;
	referrer: string;
	device_type: string;
	browser_name: string;
	os_name: string;
	events: RawSessionEventTuple[];
}

// Event icon and styling configuration
export interface EventIconConfig {
	icon: React.ReactNode;
	color: string;
	bgColor: string;
	borderColor: string;
	badgeColor: string;
}
