/**
 * Application context passed to all agents.
 * Contains website and user information needed for queries.
 */
export type AppContext = {
	userId: string;
	websiteId: string;
	websiteDomain: string;
	timezone: string;
	currentDateTime: string;
	chatId: string;
	requestHeaders?: Headers;
	/** Available query builder types */
	availableQueryTypes?: string[];
	[key: string]: unknown;
};

/**
 * Builds the application context for agent execution.
 */
export function buildAppContext(
	userId: string,
	websiteId: string,
	websiteDomain: string,
	timezone: string
): AppContext {
	return {
		userId,
		websiteId,
		websiteDomain,
		chatId: crypto.randomUUID(),
		timezone,
		currentDateTime: new Date().toISOString(),
	};
}

/**
 * Formats context as XML for LLM instructions.
 * This provides structured data the LLM can reference.
 */
export function formatContextForLLM(context: AppContext): string {
	const queryTypesInfo = context.availableQueryTypes
		? `\n<available_query_types>${context.availableQueryTypes.join(", ")}</available_query_types>`
		: "";

	return `<website_info>
<current_date>${context.currentDateTime}</current_date>
<timezone>${context.timezone}</timezone>
<website_id>${context.websiteId}</website_id>
<website_domain>${context.websiteDomain}</website_domain>${queryTypesInfo}
</website_info>

IMPORTANT CONTEXT VALUES:
- Use current_date for time-sensitive operations
- Use website_id value "${context.websiteId}" when filtering by client_id in SQL queries (pass as params.websiteId)
- Use execute_query_builder tool for pre-built analytics queries (preferred over custom SQL)
- Use execute_sql_query tool only when you need custom SQL that isn't covered by query builders`;
}
