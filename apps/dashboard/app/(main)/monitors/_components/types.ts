export interface Monitor {
	cacheBust: boolean;
	createdAt: Date | string;
	cron: string;
	granularity: string;
	id: string;
	isPaused: boolean;
	jsonParsingConfig?: {
		enabled: boolean;
	} | null;
	name: string | null;
	organizationId: string;
	timeout: number | null;
	updatedAt: Date | string;
	url: string | null;
	website: {
		id: string;
		name: string | null;
		domain: string;
	} | null;
	websiteId: string | null;
}
