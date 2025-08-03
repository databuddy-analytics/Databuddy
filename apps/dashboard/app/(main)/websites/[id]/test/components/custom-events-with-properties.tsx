'use client';

import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useDynamicQuery } from '@/hooks/use-dynamic-query';

interface CustomEventsWithPropertiesProps {
	websiteId: string;
}

// Mock data to simulate the query response with properties
const mockCustomEventsData = [
	{
		name: 'navbar-nav-click',
		total_events: 2711,
		unique_users: 1299,
		unique_sessions: 1858,
		last_occurrence: '2025-07-31 08:30:55.050',
		first_occurrence: '2025-07-01 01:49:57.205',
		unique_pages: 15,
		events_with_properties: 2650,
		percentage: 88.48,
		all_properties: [
			'{"navItem":"assistant","navType":"website","navSection":"website-nav","isExternal":"false"}',
			'{"navItem":"pricing","navType":"website","navSection":"website-nav","isExternal":"false"}',
			'{"navItem":"docs","navType":"website","navSection":"website-nav","isExternal":"false"}',
			'{"navItem":"assistant","navType":"website","navSection":"website-nav","isExternal":"false"}',
			'{"navItem":"blog","navType":"website","navSection":"website-nav","isExternal":"false"}',
			'{"navItem":"github","navType":"external","navSection":"website-nav","isExternal":"true"}',
		],
	},
	{
		name: 'button-click',
		total_events: 1205,
		unique_users: 892,
		unique_sessions: 1045,
		last_occurrence: '2025-07-31 07:15:22.123',
		first_occurrence: '2025-07-01 02:30:15.456',
		unique_pages: 8,
		events_with_properties: 1180,
		percentage: 39.35,
		all_properties: [
			'{"buttonType":"primary","action":"signup","location":"hero"}',
			'{"buttonType":"secondary","action":"learn-more","location":"features"}',
			'{"buttonType":"primary","action":"signup","location":"pricing"}',
			'{"buttonType":"ghost","action":"close","location":"modal"}',
		],
	},
];

function processPropertiesData(allProperties: string[], totalEvents: number) {
	const propertyMap = new Map<string, Map<string, number>>();

	// Parse each property JSON and count occurrences
	for (const propJson of allProperties) {
		if (propJson && typeof propJson === 'string') {
			try {
				const parsed = JSON.parse(propJson);
				for (const [key, value] of Object.entries(parsed)) {
					if (!propertyMap.has(key)) {
						propertyMap.set(key, new Map());
					}
					const valueMap = propertyMap.get(key);
					if (valueMap) {
						const stringValue = String(value);
						valueMap.set(stringValue, (valueMap.get(stringValue) || 0) + 1);
					}
				}
			} catch {
				// Skip invalid JSON
			}
		}
	}

	// Convert to the expected format
	const propertyCategories: Array<{
		key: string;
		total: number;
		values: Array<{ value: string; count: number; percentage: string }>;
	}> = [];
	for (const [key, valueMap] of propertyMap) {
		const values = Array.from(valueMap.entries()).map(([value, count]) => ({
			value,
			count,
			percentage: ((count / totalEvents) * 100).toFixed(1),
		}));

		const total = values.reduce((sum, v) => sum + v.count, 0);

		propertyCategories.push({
			key,
			total,
			values: values.sort((a, b) => b.count - a.count),
		});
	}

	// Sort categories by total count
	return propertyCategories.sort((a, b) => b.total - a.total);
}

export function CustomEventsWithProperties({
	websiteId,
}: CustomEventsWithPropertiesProps) {
	const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
		new Set()
	);

	// Use real API call instead of mock data
	const { data, isLoading, error } = useDynamicQuery(
		websiteId,
		{
			start_date: '2025-01-01',
			end_date: '2025-01-31',
		},
		{
			parameters: ['custom_events'],
		}
	);

	const customEventsData = data?.custom_events || [];

	const togglePropertyExpansion = (propertyId: string) => {
		const newExpanded = new Set(expandedProperties);
		if (newExpanded.has(propertyId)) {
			newExpanded.delete(propertyId);
		} else {
			newExpanded.add(propertyId);
		}
		setExpandedProperties(newExpanded);
	};

	const formatNumber = (value: number): string => {
		return Intl.NumberFormat(undefined, {
			notation: 'compact',
			maximumFractionDigits: 1,
		}).format(value);
	};

	if (error) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="text-center text-red-600">
						Error loading custom events: {error.message}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Custom Events with Properties</CardTitle>
					<CardDescription>
						This shows real custom events data with JSON properties parsed and
						displayed.
						{isLoading && ' Loading...'}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="py-8 text-center">Loading custom events...</div>
					) : customEventsData.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground">
							No custom events found for this period
						</div>
					) : (
						<div className="space-y-6">
							{customEventsData.map((event: any) => {
								const processedProperties = processPropertiesData(
									event.all_properties,
									event.total_events
								);

								return (
									<div className="rounded border p-4" key={event.name}>
										<div className="mb-4">
											<h3 className="font-semibold text-lg">{event.name}</h3>
											<div className="mt-1 flex gap-4 text-muted-foreground text-sm">
												<span>
													Total Events: {formatNumber(event.total_events)}
												</span>
												<span>
													With Properties:{' '}
													{formatNumber(event.events_with_properties)}
												</span>
												<span>Users: {formatNumber(event.unique_users)}</span>
											</div>
										</div>

										{processedProperties.length > 0 && (
											<div className="space-y-2">
												<h4 className="font-medium text-sm">
													Properties Breakdown:
												</h4>
												{processedProperties.map((property) => {
													const propertyId = `${event.name}-${property.key}`;
													const isExpanded = expandedProperties.has(propertyId);

													return (
														<div className="rounded border" key={property.key}>
															<button
																className="flex w-full items-center justify-between bg-muted/20 px-3 py-2 hover:bg-muted/40"
																onClick={() =>
																	togglePropertyExpansion(propertyId)
																}
																type="button"
															>
																<div className="flex items-center gap-2">
																	{isExpanded ? (
																		<CaretDownIcon
																			className="h-3 w-3 text-muted-foreground"
																			size={16}
																			weight="fill"
																		/>
																	) : (
																		<CaretRightIcon
																			className="h-3 w-3 text-muted-foreground"
																			size={16}
																			weight="fill"
																		/>
																	)}
																	<span className="font-medium text-sm">
																		{property.key}
																	</span>
																</div>
																<div className="flex items-center gap-2">
																	<span className="font-medium text-sm">
																		{formatNumber(property.total)}
																	</span>
																	<div className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
																		{property.values.length}{' '}
																		{property.values.length === 1
																			? 'value'
																			: 'values'}
																	</div>
																</div>
															</button>

															{isExpanded && (
																<div className="border-t">
																	{property.values.map(
																		(valueItem, valueIndex) => (
																			<div
																				className="flex items-center justify-between border-b px-3 py-2 last:border-b-0 hover:bg-muted/10"
																				key={`${property.key}-${valueItem.value}-${valueIndex}`}
																			>
																				<span
																					className="truncate font-mono text-sm"
																					title={valueItem.value}
																				>
																					{valueItem.value}
																				</span>
																				<div className="flex items-center gap-2">
																					<span className="font-medium text-sm">
																						{formatNumber(valueItem.count)}
																					</span>
																					<div className="min-w-[2.5rem] rounded bg-muted px-2 py-0.5 text-center font-medium text-muted-foreground text-xs">
																						{valueItem.percentage}%
																					</div>
																				</div>
																			</div>
																		)
																	)}
																</div>
															)}
														</div>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Raw Properties Data</CardTitle>
					<CardDescription>
						This shows the raw all_properties array that would come from the
						ClickHouse query
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="py-8 text-center">Loading...</div>
					) : customEventsData.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground">
							No custom events data
						</div>
					) : (
						<div className="space-y-4">
							{customEventsData.map((event: any) => (
								<div className="rounded border p-4" key={event.name}>
									<h3 className="mb-2 font-semibold">{event.name}</h3>
									<div className="mb-2 text-muted-foreground text-sm">
										Total Events: {event.total_events} | With Properties:{' '}
										{event.events_with_properties}
									</div>
									<div className="space-y-1">
										<div className="font-medium text-sm">
											Raw Properties JSON (all_properties field):
										</div>
										{event.all_properties && event.all_properties.length > 0 ? (
											event.all_properties.map(
												(prop: string, index: number) => (
													<div
														className="rounded bg-muted p-2 font-mono text-xs"
														key={`${event.name}-${index}`}
													>
														{prop || 'null'}
													</div>
												)
											)
										) : (
											<div className="text-muted-foreground text-sm">
												No properties data available
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
