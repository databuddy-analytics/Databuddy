import type { Website as WebsiteSchema } from "@databuddy/db";

export type Website = WebsiteSchema;

export interface MiniChartDataPoint {
	date: string;
	value: number;
}

export interface ProcessedMiniChartData {
	data: MiniChartDataPoint[];
	totalViews: number;
	hasAnyData: boolean;
	trend: {
		type: "up" | "down" | "neutral";
		value: number;
	} | null;
}

export interface CreateWebsiteData {
	name: string;
	domain: string;
	subdomain?: string;
}

export interface UpdateWebsiteData {
	name: string;
}

// For components that need minimal website info
export interface WebsiteBasic {
	id: string;
	name?: string | null;
	domain: string;
}

// API response types
export interface WebsiteApiResponse {
	success: boolean;
	data?: Website;
	error?: string;
}

export interface WebsitesApiResponse {
	success: boolean;
	data?: Website[];
	error?: string;
}

export interface CountryData {
	country: string;
	country_code?: string;
	visitors: number;
	pageviews: number;
}

export interface RegionData {
	country: string;
	visitors: number;
	pageviews: number;
}

export interface LocationData {
	countries: CountryData[];
	regions: RegionData[];
}
