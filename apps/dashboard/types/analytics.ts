export interface DateRange {
	end_date: string;
	granularity?: "hourly" | "daily";
	start_date: string;
	timezone?: string;
}

export interface ProfileData {
	browser_name: string;
	country: string;
	custom_event_count: number;
	device_type: string;
	first_visit: string;
	last_visit: string;
	os_name: string;
	referrer: string;
	region: string;
	session_count: number;
	total_events: number;
	unique_event_names: number;
	visitor_id: string;
}
