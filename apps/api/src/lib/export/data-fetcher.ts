// Data fetching logic for exports

import { chQuery } from "@databuddy/db";
import { logger } from "../logger";
import {
	buildDateFilter,
	getErrorsQuery,
	getEventsQuery,
	getWebVitalsQuery,
} from "./queries";
import type {
	ExportRequest,
	SanitizedError,
	SanitizedEvent,
	SanitizedWebVitals,
} from "./types";

export type ExportData = {
	events: SanitizedEvent[];
	errors: SanitizedError[];
	webVitals: SanitizedWebVitals[];
};

export async function fetchExportData(
	request: ExportRequest
): Promise<ExportData> {
	const {
		website_id: websiteId,
		start_date: startDate,
		end_date: endDate,
	} = request;

	try {
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
			chQuery<SanitizedEvent>(eventsQuery, queryParams).catch((error) => {
				logger.error({
					message: "Failed to fetch events for export",
					websiteId,
					error: error instanceof Error ? error.message : String(error),
				});
				throw new Error(
					`Failed to fetch events: ${error instanceof Error ? error.message : String(error)}`
				);
			}),
			chQuery<SanitizedError>(errorsQuery, queryParams).catch((error) => {
				logger.error({
					message: "Failed to fetch errors for export",
					websiteId,
					error: error instanceof Error ? error.message : String(error),
				});
				throw new Error(
					`Failed to fetch errors: ${error instanceof Error ? error.message : String(error)}`
				);
			}),
			chQuery<SanitizedWebVitals>(webVitalsQuery, queryParams).catch(
				(error) => {
					logger.error({
						message: "Failed to fetch web vitals for export",
						websiteId,
						error: error instanceof Error ? error.message : String(error),
					});
					throw new Error(
						`Failed to fetch web vitals: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			),
		]);

		return {
			events,
			errors,
			webVitals,
		};
	} catch (error) {
		logger.error({
			message: "Export data fetch failed",
			websiteId,
			startDate,
			endDate,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		throw error;
	}
}
