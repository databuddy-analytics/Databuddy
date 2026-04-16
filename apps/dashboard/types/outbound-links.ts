export interface OutboundLinkRow {
	href: string;
	name: string;
	percentage: number;
	text: string;
	total_clicks: number;
	unique_sessions: number;
	unique_users: number;
}

export interface OutboundDomainRow {
	domain: string;
	name: string;
	percentage: number;
	total_clicks: number;
	unique_links: number;
	unique_users: number;
}

export interface OutboundLinksSectionData {
	outbound_domains: unknown[];
	outbound_links: unknown[];
}

export interface OutboundLinksSectionProps {
	data: OutboundLinksSectionData;
	isLoading: boolean;
	onAddFilterAction: (field: string, value: string) => void;
}
