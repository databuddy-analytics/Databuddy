// Page-related analytics types

export interface EntryPageData {
	name: string; // This is the path
	entries: number;
	visitors: number;
	sessions: number;
	bounce_rate: number;
}

export interface ExitPageData {
	name: string; // This is the path
	exits: number;
	sessions: number;
	visitors?: number;
}

export interface GroupedBrowserData {
	name: string; // browser name (e.g., "Chrome", "Firefox")
	visitors: number;
	pageviews: number;
	sessions: number;
	versions: {
		name: string; // version number
		version: string;
		visitors: number;
		pageviews: number;
		sessions: number;
	}[];
}

export interface SessionsSummaryData {
	total_sessions: number;
	total_users: number;
}

export interface SessionsResponse {
	sessions: Record<string, unknown>[];
	pagination: {
		page: number;
		limit: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}
