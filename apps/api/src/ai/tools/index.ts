import { executeSqlQueryTool } from "./execute-sql-query";
import { getTopPagesTool } from "./get-top-pages";

/**
 * Individual tool exports for direct use.
 */
export { executeSqlQueryTool } from "./execute-sql-query";
export { getTopPagesTool } from "./get-top-pages";

/**
 * Tools grouped by agent type.
 * Use these when configuring agents.
 */
export const analyticsTools = {
	get_top_pages: getTopPagesTool,
	execute_sql_query: executeSqlQueryTool,
} as const;

/**
 * All available tools.
 * @deprecated Use agent-specific tool groups instead.
 */
export const tools = {
	execute_sql_query: executeSqlQueryTool,
	get_top_pages: getTopPagesTool,
} as const;
