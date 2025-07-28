// Shared Website types for consistency across the codebase

export interface Website {
	id: string;
	name: string | null;
	domain: string;
	userId?: string | null;
	projectId?: string | null;
	status?: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'HEALTHY' | 'UNHEALTHY';
	createdAt: string;
	updatedAt: string;
	deletedAt?: string | null;
}

export interface MiniChartDataPoint {
	date: string;
	value: number;
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
