export interface JourneyTransition {
	avg_step_in_journey: number;
	from_page: string;
	sessions: number;
	to_page: string;
	transitions: number;
	users: number;
}

export interface JourneyPath {
	avg_duration_minutes: number;
	avg_duration_seconds: number;
	avg_pages_in_path: number;
	entry_page: string;
	exit_page: string;
	frequency: number;
	name: string;
	unique_users: number;
}

export interface JourneyDropoff {
	continuation_rate: number;
	continuations: number;
	exit_rate: number;
	exits: number;
	name: string;
	total_sessions: number;
	total_users: number;
	total_visits: number;
}

export interface JourneyEntryPoint {
	avg_pages_per_session: number;
	bounce_rate: number;
	entries: number;
	name: string;
	sessions: number;
	users: number;
}
