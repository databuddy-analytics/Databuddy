import type {
	ClassifiedEvent,
	ClassifiedProperty,
	CustomEventItem,
	PropertyClassification,
	PropertyDistribution,
	PropertyTopValue,
} from "./types";

function groupClassificationsByEvent(
	classifications: PropertyClassification[]
): Map<string, PropertyClassification[]> {
	const grouped = new Map<string, PropertyClassification[]>();

	for (const classification of classifications) {
		const existing = grouped.get(classification.event_name) ?? [];
		existing.push(classification);
		grouped.set(classification.event_name, existing);
	}

	return grouped;
}

function groupDistributionsByEventAndProperty(
	distributions: PropertyDistribution[]
): Map<string, Map<string, PropertyDistribution[]>> {
	const grouped = new Map<string, Map<string, PropertyDistribution[]>>();

	for (const distribution of distributions) {
		if (!grouped.has(distribution.event_name)) {
			grouped.set(distribution.event_name, new Map());
		}
		const eventMap = grouped.get(distribution.event_name);
		if (eventMap) {
			const existing = eventMap.get(distribution.property_key) ?? [];
			existing.push(distribution);
			eventMap.set(distribution.property_key, existing);
		}
	}

	return grouped;
}

function groupTopValuesByEventAndProperty(
	topValues: PropertyTopValue[]
): Map<string, Map<string, PropertyTopValue[]>> {
	const grouped = new Map<string, Map<string, PropertyTopValue[]>>();

	for (const topValue of topValues) {
		if (!grouped.has(topValue.event_name)) {
			grouped.set(topValue.event_name, new Map());
		}
		const eventMap = grouped.get(topValue.event_name);
		if (eventMap) {
			const existing = eventMap.get(topValue.property_key) ?? [];
			existing.push(topValue);
			eventMap.set(topValue.property_key, existing);
		}
	}

	return grouped;
}

export function classifyEventProperties(
	events: CustomEventItem[],
	classifications: PropertyClassification[],
	distributions: PropertyDistribution[],
	topValues: PropertyTopValue[]
): ClassifiedEvent[] {
	const classificationsByEvent = groupClassificationsByEvent(classifications);
	const distributionsByEventProp =
		groupDistributionsByEventAndProperty(distributions);
	const topValuesByEventProp = groupTopValuesByEventAndProperty(topValues);

	return events.map((event) => {
		const eventClassifications = classificationsByEvent.get(event.name) ?? [];
		const eventDistributions = distributionsByEventProp.get(event.name);
		const eventTopValues = topValuesByEventProp.get(event.name);

		const summaryProperties: ClassifiedProperty[] = [];
		const detailProperties: ClassifiedProperty[] = [];

		for (const classification of eventClassifications) {
			const propertyKey = classification.property_key;
			let values: PropertyTopValue[] | PropertyDistribution[] = [];

			if (
				classification.render_strategy === "distribution_bar" ||
				classification.render_strategy === "top_n_chart"
			) {
				values = eventDistributions?.get(propertyKey) ?? [];
			} else if (classification.render_strategy === "top_n_with_other") {
				values = eventTopValues?.get(propertyKey) ?? [];
			}

			const classifiedProperty: ClassifiedProperty = {
				key: propertyKey,
				classification,
				values,
			};

			if (classification.render_strategy === "detail_only") {
				detailProperties.push(classifiedProperty);
			} else {
				summaryProperties.push(classifiedProperty);
			}
		}

		summaryProperties.sort((a, b) => {
			const strategyOrder = {
				distribution_bar: 0,
				top_n_chart: 1,
				top_n_with_other: 2,
				detail_only: 3,
			};
			const orderA = strategyOrder[a.classification.render_strategy];
			const orderB = strategyOrder[b.classification.render_strategy];
			if (orderA !== orderB) {
				return orderA - orderB;
			}
			return b.classification.total_count - a.classification.total_count;
		});

		detailProperties.sort(
			(a, b) => b.classification.cardinality - a.classification.cardinality
		);

		return {
			name: event.name,
			total_events: event.total_events,
			summaryProperties,
			detailProperties,
		};
	});
}

export function getPropertyTypeLabel(
	classification: PropertyClassification
): string {
	switch (classification.inferred_type) {
		case "boolean":
			return "Yes/No";
		case "numeric":
			return "Number";
		case "datetime":
			return "Date";
		case "url":
			return "URL";
		case "categorical":
			return "Category";
		case "aggregatable":
			return "Top values";
		case "text":
			return "Text";
		case "high_cardinality":
			return "Unique";
		default:
			return "Unknown";
	}
}
