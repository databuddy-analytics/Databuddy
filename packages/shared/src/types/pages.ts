// Page-related analytics types

export interface EntryPageData {
	bounce_rate: number;
	entries: number;
	name: string; // This is the path
	sessions: number;
	visitors: number;
}

export interface ExitPageData {
	exits: number;
	name: string; // This is the path
	sessions: number;
	visitors?: number;
}

export interface GroupedBrowserData {
	name: string; // browser name (e.g., "Chrome", "Firefox")
	pageviews: number;
	sessions: number;
	versions: {
		name: string; // version number
		version: string;
		visitors: number;
		pageviews: number;
		sessions: number;
	}[];
	visitors: number;
}

export interface SessionsSummaryData {
	total_sessions: number;
	total_users: number;
}

export interface SessionsResponse {
	pagination: {
		page: number;
		limit: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
	sessions: any[];
}
