import type { AppContext } from "../config/context";
import { formatContextForLLM } from "../config/context";
import { CLICKHOUSE_SCHEMA_DOCS } from "../config/schema-docs";
import { COMMON_AGENT_RULES } from "./shared";

/**
 * Analytics-specific rules for data analysis and presentation.
 */
const ANALYTICS_RULES = `<agent-specific-rules>
- Lead with key metrics and insights
- Provide 2-3 actionable recommendations
- Use the get_top_pages tool for page analytics
- Use the execute_sql_query tool for custom analytics queries
- Always include time context (e.g., "in the last 7 days")
- Format large numbers with commas for readability
- CRITICAL: execute_sql_query must ONLY use SELECT/WITH and parameter placeholders (e.g., {websiteId:String}) with values passed via params. Never interpolate strings.
- Example: execute_sql_query({ sql: "SELECT ... WHERE client_id = {websiteId:String}", params: { websiteId: "<use website_id from context>" } })
- Tables must be compact and readable: ≤5 columns, short headers, include units (%, ms, s), no empty columns, align numbers right and text left, no blank rows.
</agent-specific-rules>`;

/**
 * Builds the instruction prompt for the analytics agent.
 */
export function buildAnalyticsInstructions(ctx: AppContext): string {
	return `You are an analytics specialist for ${ctx.websiteDomain}. Your goal is to analyze website traffic, user behavior, and performance metrics.

<background-data>
${formatContextForLLM(ctx)}
</background-data>

${COMMON_AGENT_RULES}

${ANALYTICS_RULES}

${CLICKHOUSE_SCHEMA_DOCS}`;
}
