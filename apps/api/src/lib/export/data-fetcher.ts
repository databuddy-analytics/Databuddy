// Data fetching logic for exports

import { chQuery } from '@databuddy/db';
import {
	buildDateFilter,
	getErrorsQuery,
	getEventsQuery,
	getWebVitalsQuery,
} from './queries';
import type {
	ExportRequest,
	SanitizedError,
	SanitizedEvent,
	SanitizedWebVitals,
} from './types';

export interface ExportData {
	events: SanitizedEvent[];
	errors: SanitizedError[];
	webVitals: SanitizedWebVitals[];
}

export async function fetchExportData(
	request: ExportRequest
): Promise<ExportData> {
	const {
		website_id: websiteId,
		start_date: startDate,
		end_date: endDate,
	} = request;

	// Build secure date filter with parameters
	const { filter: dateFilter, params: dateParams } = buildDateFilter(
		startDate,
		endDate
	);

	// Prepare queries
	const eventsQuery = getEventsQuery(dateFilter);
	const errorsQuery = getErrorsQuery(dateFilter);
	const webVitalsQuery = getWebVitalsQuery(dateFilter);

	// Combine parameters: websiteId + date parameters
	const queryParams = { websiteId, ...dateParams };

	// Execute queries in parallel with secure parameters
	const [events, errors, webVitals] = await Promise.all([
		chQuery<SanitizedEvent>(eventsQuery, queryParams),
		chQuery<SanitizedError>(errorsQuery, queryParams),
		chQuery<SanitizedWebVitals>(webVitalsQuery, queryParams),
	]);

	return {
		events,
		errors,
		webVitals,
	};
}
