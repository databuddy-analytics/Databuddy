'use client';

import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/analytics';
import type {
	CustomEventsSectionProps,
	EventProperty,
	OutboundDomainData,
	OutboundLinkData,
	ProcessedCustomEvent,
	PropertySubRow,
} from '@/types/custom-events';

const formatNumber = (value: number): string => {
	if (value == null || Number.isNaN(value)) {
		return '0';
	}
	return Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(value);
};

const PROTOCOL_REGEX = /^https?:\/\//;
const JSON_QUOTE_REGEX = /^"(.*)"$/;

const cleanPropertyValue = (value: string): string => {
	return value.replace(JSON_QUOTE_REGEX, '$1');
};

const createEventIndicator = () => (
	<div className="h-2 w-2 flex-shrink-0 rounded bg-primary" />
);

const createDomainIndicator = () => (
	<div className="h-2 w-2 flex-shrink-0 rounded bg-blue-500" />
);

const createPercentageBadge = (percentage: number) => (
	<div className="inline-flex items-center rounded bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
		{percentage.toFixed(1)}%
	</div>
);

const createMetricDisplay = (value: number, label: string) => (
	<div>
		<div className="font-medium text-foreground">{formatNumber(value)}</div>
		<div className="text-muted-foreground text-xs">{label}</div>
	</div>
);

export function CustomEventsSection({
	customEventsData,
	isLoading,
	onAddFilter,
}: CustomEventsSectionProps) {
	const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
		new Set()
	);

	const processedEvents = useMemo(() => {
		if (!customEventsData?.custom_events?.length) {
			return [];
		}

		const events = customEventsData.custom_events;
		const properties = customEventsData.custom_event_properties || [];

		const propertiesByEvent = new Map<string, EventProperty[]>();
		for (const prop of properties) {
			if (!propertiesByEvent.has(prop.name)) {
				propertiesByEvent.set(prop.name, []);
			}
			propertiesByEvent.get(prop.name)?.push(prop);
		}

		return events.map((event): ProcessedCustomEvent => {
			const eventProps = propertiesByEvent.get(event.name) || [];
			const properties: Record<
				string,
				Array<{ value: string; count: number }>
			> = {};

			for (const prop of eventProps) {
				if (!properties[prop.property_key]) {
					properties[prop.property_key] = [];
				}
				properties[prop.property_key].push({
					value: cleanPropertyValue(prop.property_value),
					count: prop.count,
				});
			}

			for (const key in properties) {
				if (properties[key]) {
					properties[key].sort((a, b) => b.count - a.count);
				}
			}

			return { ...event, properties };
		});
	}, [
		customEventsData.custom_events,
		customEventsData.custom_event_properties,
	]);

	const toggleProperty = useCallback((propertyId: string) => {
		setExpandedProperties((prev) => {
			const next = new Set(prev);
			if (next.has(propertyId)) {
				next.delete(propertyId);
			} else {
				next.add(propertyId);
			}
			return next;
		});
	}, []);

	const customEventsColumns = useMemo(
		() => [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Event Name',
				cell: ({ getValue }: any) => (
					<div className="flex items-center gap-3">
						{createEventIndicator()}
						<span className="font-medium text-foreground">{getValue()}</span>
					</div>
				),
			},
			{
				id: 'total_events',
				accessorKey: 'total_events',
				header: 'Events',
				cell: ({ getValue }: any) => createMetricDisplay(getValue(), 'total'),
			},
			{
				id: 'unique_users',
				accessorKey: 'unique_users',
				header: 'Users',
				cell: ({ getValue }: any) => createMetricDisplay(getValue(), 'unique'),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: ({ getValue }: any) => createPercentageBadge(getValue()),
			},
		],
		[]
	);

	const outboundLinksColumns = useMemo(
		() => [
			{
				id: 'href',
				accessorKey: 'href',
				header: 'URL',
				cell: ({ getValue }: any) => {
					const href = getValue();
					const domain = href.replace(PROTOCOL_REGEX, '').split('/')[0];
					return (
						<div className="flex flex-col gap-1">
							<a
								className="max-w-[300px] truncate font-medium text-primary hover:underline"
								href={href}
								rel="noopener noreferrer"
								target="_blank"
								title={href}
							>
								{domain}
							</a>
							<span
								className="max-w-[300px] truncate text-muted-foreground text-xs"
								title={href}
							>
								{href}
							</span>
						</div>
					);
				},
			},
			{
				id: 'text',
				accessorKey: 'text',
				header: 'Text',
				cell: ({ getValue }: any) => {
					const text = getValue();
					return (
						<span className="max-w-[200px] truncate font-medium" title={text}>
							{text || '(no text)'}
						</span>
					);
				},
			},
			{
				id: 'total_clicks',
				accessorKey: 'total_clicks',
				header: 'Clicks',
				cell: ({ getValue }: any) => createMetricDisplay(getValue(), 'total'),
			},
			{
				id: 'unique_users',
				accessorKey: 'unique_users',
				header: 'Users',
				cell: ({ getValue }: any) => createMetricDisplay(getValue(), 'unique'),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: ({ getValue }: any) => createPercentageBadge(getValue()),
			},
		],
		[]
	);

	const outboundDomainsColumns = useMemo(
		() => [
			{
				id: 'domain',
				accessorKey: 'domain',
				header: 'Domain',
				cell: ({ getValue }: any) => (
					<div className="flex items-center gap-3">
						{createDomainIndicator()}
						<span className="font-medium text-foreground">{getValue()}</span>
					</div>
				),
			},
			{
				id: 'total_clicks',
				accessorKey: 'total_clicks',
				header: 'Clicks',
				cell: ({ getValue }: any) => createMetricDisplay(getValue(), 'total'),
			},
			{
				id: 'unique_users',
				accessorKey: 'unique_users',
				header: 'Users',
				cell: ({ getValue }: any) => createMetricDisplay(getValue(), 'unique'),
			},
			{
				id: 'unique_links',
				accessorKey: 'unique_links',
				header: 'Links',
				cell: ({ getValue }: any) => createMetricDisplay(getValue(), 'unique'),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: ({ getValue }: any) => createPercentageBadge(getValue()),
			},
		],
		[]
	);

	return (
		<DataTable
			description="User-defined events, interactions, and outbound link tracking"
			expandable
			getSubRows={(row: ProcessedCustomEvent): any[] => {
				if (!row.properties || typeof row.properties !== 'object') {
					return [];
				}
				const propertyKeys = Object.keys(row.properties);
				return propertyKeys.map(
					(key): PropertySubRow => ({
						key,
						values: row.properties[key] || [],
					})
				);
			}}
			isLoading={isLoading}
			minHeight="350px"
			onAddFilter={onAddFilter}
			renderSubRow={(
				subRow: PropertySubRow,
				parentRow: ProcessedCustomEvent
			) => {
				const propertyKey = subRow.key;
				const propertyValues = subRow.values;
				const propertyId = `${parentRow.name}-${propertyKey}`;
				const isExpanded = expandedProperties.has(propertyId);
				const totalCount = propertyValues.reduce((sum, v) => sum + v.count, 0);

				return (
					<div className="ml-4">
						<button
							aria-controls={`property-${propertyId}`}
							aria-expanded={isExpanded}
							className="flex w-full items-center justify-between rounded border border-sidebar-border/30 bg-sidebar-accent/20 px-3 py-2.5 transition-colors hover:bg-sidebar-accent/50"
							onClick={() => toggleProperty(propertyId)}
							type="button"
						>
							<div className="flex items-center gap-2">
								{isExpanded ? (
									<CaretDownIcon
										className="h-3 w-3 text-sidebar-foreground/60"
										size={16}
										weight="fill"
									/>
								) : (
									<CaretRightIcon
										className="h-3 w-3 text-sidebar-foreground/60"
										size={16}
										weight="fill"
									/>
								)}
								<span
									className="font-medium text-sidebar-foreground text-sm"
									id={`property-header-${propertyId}`}
								>
									{propertyKey}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<div className="font-medium text-sidebar-foreground text-sm">
									{formatNumber(totalCount)}
								</div>
								<div className="rounded bg-sidebar-ring/10 px-2 py-0.5 font-medium text-sidebar-ring text-xs">
									{propertyValues.length}{' '}
									{propertyValues.length === 1 ? 'value' : 'values'}
								</div>
							</div>
						</button>

						{isExpanded && (
							<div
								aria-labelledby={`property-header-${propertyId}`}
								className="mt-1 max-h-48 overflow-y-auto rounded border border-sidebar-border/20"
								id={`property-${propertyId}`}
								role="region"
							>
								{propertyValues.map((valueItem, index) => (
									<div
										className="flex items-center justify-between border-sidebar-border/10 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-sidebar-accent/20"
										key={`${propertyKey}-${valueItem.value}-${index}`}
									>
										<span
											className="truncate font-mono text-sidebar-foreground text-sm"
											title={valueItem.value}
										>
											{valueItem.value}
										</span>
										<div className="flex items-center gap-2">
											<span className="font-medium text-sidebar-foreground text-sm">
												{formatNumber(valueItem.count)}
											</span>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				);
			}}
			tabs={[
				{
					id: 'custom_events',
					label: 'Custom Events',
					data: processedEvents,
					columns: customEventsColumns,
				},
				{
					id: 'outbound_links',
					label: 'Outbound Links',
					data: (customEventsData.outbound_links || [])
						.filter((link) => link && typeof link === 'object' && link.href)
						.map((link) => ({
							...link,
							name: link.href,
						})),
					columns: outboundLinksColumns,
					getFilter: (row: OutboundLinkData) => ({
						field: 'href',
						value: row.href,
					}),
				},
				{
					id: 'outbound_domains',
					label: 'Outbound Domains',
					data: (customEventsData.outbound_domains || [])
						.filter(
							(domain) => domain && typeof domain === 'object' && domain.domain
						)
						.map((domain) => ({
							...domain,
							name: domain.domain,
						})),
					columns: outboundDomainsColumns,
					getFilter: (row: OutboundDomainData) => ({
						field: 'href',
						value: `*${row.domain}*`,
					}),
				},
			]}
			title="Events & Links"
		/>
	);
}
