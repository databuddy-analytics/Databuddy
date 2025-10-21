export interface CustomEventData {
	name: string;
	total_events: number;
	unique_users: number;
	percentage: number;
}

export interface EventProperty {
	name: string;
	property_key: string;
	property_value: string;
	count: number;
}

export interface OutboundLinkData {
	name: string; // Using href as name for DataTable compatibility
	href: string;
	text: string;
	total_clicks: number;
	unique_users: number;
	unique_sessions: number;
	percentage: number;
}

export interface OutboundDomainData {
	name: string; // Using domain as name for DataTable compatibility
	domain: string;
	total_clicks: number;
	unique_users: number;
	unique_links: number;
	percentage: number;
}

export interface ProcessedCustomEvent extends CustomEventData {
	properties: Record<string, Array<{ value: string; count: number }>>;
}

export interface CustomEventsData {
	custom_events: CustomEventData[];
	custom_event_properties: EventProperty[];
	outbound_links: OutboundLinkData[];
	outbound_domains: OutboundDomainData[];
}

export interface CustomEventsSectionProps {
	customEventsData: CustomEventsData;
	isLoading: boolean;
	onAddFilter: (field: string, value: string) => void;
	className?: string;
}

export interface PropertySubRow {
	key: string;
	values: Array<{ value: string; count: number }>;
}
