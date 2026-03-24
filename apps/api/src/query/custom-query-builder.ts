/**
 * Custom Query Builder
 * Builds safe ClickHouse SQL from user-defined query configurations
 * All table/column names are validated against the schema whitelist
 */

import { chQuery } from "@databuddy/db";
import {
	ANALYTICS_TABLES,
	getColumnDefinition,
	getTableDefinition,
	isValidColumn,
	isValidTable,
} from "@databuddy/shared/schema/analytics-tables";
import type {
	AggregateFunction,
	CustomQueryConfig,
	CustomQueryFilter,
	CustomQueryOperator,
	CustomQueryRequest,
	CustomQueryResponse,
	CustomQuerySelect,
} from "@databuddy/shared/types/custom-query";
import { useLogger } from "evlog/elysia";

// Identifier validation for SQL injection prevention
const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;

function containsSqlInjectionChars(str: string): boolean {
	for (let i = 0; i < str.length; i += 1) {
		const code = str.charCodeAt(i);
		if (
			code === 0x3b || // ;
			code === 0x27 || // '
			code === 0x22 || // "
			code === 0x5c || // \
			code === 0x60 || // `
			(code >= 0x00 && code <= 0x1f) || // control chars
			(code >= 0x7f && code <= 0x9f) // extended control chars
		) {
			return true;
		}
	}
	return false;
}

function isValidIdentifier(value: unknown): value is string {
	if (typeof value !== "string") {
		return false;
	}
	if (value.length === 0 || value.length > 64) {
		return false;
	}
	if (containsSqlInjectionChars(value)) {
		return false;
	}
	return IDENTIFIER_PATTERN.test(value);
}

/**
 * Validation error for custom queries
 */
export class CustomQueryValidationError extends Error {
	field?: string;

	constructor(message: string, field?: string) {
		super(message);
		this.name = "CustomQueryValidationError";
		this.field = field;
	}
}

/**
 * Map aggregate function to ClickHouse SQL
 */
function aggregateToSQL(aggregate: AggregateFunction, field: string): string {
	switch (aggregate) {
		case "count":
			return field === "*" ? "count()" : `count(${field})`;
		case "uniq":
			return `uniq(${field})`;
		case "sum":
			return `sum(${field})`;
		case "avg":
			return `avg(${field})`;
		case "max":
			return `max(${field})`;
		case "min":
			return `min(${field})`;
		default:
			throw new CustomQueryValidationError(
				`Unknown aggregate function: ${aggregate}`
			);
	}
}

/**
 * Map filter operator to ClickHouse SQL expression
 */
function operatorToSQL(
	field: string,
	operator: CustomQueryOperator,
	paramName: string
): string {
	switch (operator) {
		case "eq":
			return `${field} = {${paramName}:String}`;
		case "ne":
			return `${field} != {${paramName}:String}`;
		case "gt":
			return `${field} > {${paramName}:Float64}`;
		case "lt":
			return `${field} < {${paramName}:Float64}`;
		case "gte":
			return `${field} >= {${paramName}:Float64}`;
		case "lte":
			return `${field} <= {${paramName}:Float64}`;
		case "contains":
			return `${field} LIKE {${paramName}:String}`;
		case "not_contains":
			return `${field} NOT LIKE {${paramName}:String}`;
		case "starts_with":
			return `startsWith(${field}, {${paramName}:String})`;
		case "in":
			return `${field} IN {${paramName}:Array(String)}`;
		case "not_in":
			return `${field} NOT IN {${paramName}:Array(String)}`;
		default:
			throw new CustomQueryValidationError(`Unknown operator: ${operator}`);
	}
}

/**
 * Prepare filter value for parameterization
 */
function prepareFilterValue(
	operator: CustomQueryOperator,
	value: string | number | (string | number)[]
): string | number | string[] {
	if (operator === "contains" || operator === "not_contains") {
		return `%${String(value)}%`;
	}
	if (operator === "in" || operator === "not_in") {
		if (Array.isArray(value)) {
			return value.map(String);
		}
		return [String(value)];
	}
	if (Array.isArray(value)) {
		return value.map(String);
	}
	return value;
}

/**
 * Validate a SELECT expression
 */
function validateSelect(select: CustomQuerySelect, tableName: string): void {
	if (
		select.field !== "*" &&
		(typeof select.field !== "string" ||
			!isValidColumn(tableName, select.field))
	) {
		throw new CustomQueryValidationError(
			`Invalid column for table "${tableName}"`,
			"selects"
		);
	}

	if (select.field === "*" && select.aggregate !== "count") {
		throw new CustomQueryValidationError(
			`Aggregate "${select.aggregate}" requires a specific column, not "*"`,
			"selects"
		);
	}

	if (select.field !== "*" && typeof select.field === "string") {
		const column = getColumnDefinition(tableName, select.field);
		if (
			column &&
			!column.aggregatable &&
			select.aggregate !== "count" &&
			select.aggregate !== "uniq"
		) {
			throw new CustomQueryValidationError(
				`Column cannot be used with aggregate "${select.aggregate}"`,
				"selects"
			);
		}
	}
}

/**
 * Validate a filter condition
 */
function validateFilter(filter: CustomQueryFilter, tableName: string): void {
	if (
		typeof filter.field !== "string" ||
		!isValidColumn(tableName, filter.field)
	) {
		throw new CustomQueryValidationError(
			`Invalid filter column for table "${tableName}"`,
			"filters"
		);
	}

	const column = getColumnDefinition(tableName, filter.field);
	if (column && !column.filterable) {
		throw new CustomQueryValidationError(
			"Column cannot be used in filters",
			"filters"
		);
	}
}

/**
 * Validate the entire query configuration
 */
function validateQueryConfig(config: CustomQueryConfig): void {
	if (typeof config.table !== "string" || !isValidTable(config.table)) {
		const validTables = ANALYTICS_TABLES.map((table) => table.name).join(", ");
		throw new CustomQueryValidationError(
			`Invalid table. Valid tables: ${validTables}`,
			"table"
		);
	}

	if (!config.selects || config.selects.length === 0) {
		throw new CustomQueryValidationError(
			"At least one SELECT expression is required",
			"selects"
		);
	}

	if (config.selects.length > 10) {
		throw new CustomQueryValidationError(
			"Maximum 10 SELECT expressions allowed",
			"selects"
		);
	}

	for (const select of config.selects) {
		validateSelect(select, config.table);
	}

	if (config.filters) {
		if (config.filters.length > 20) {
			throw new CustomQueryValidationError(
				"Maximum 20 filters allowed",
				"filters"
			);
		}
		for (const filter of config.filters) {
			validateFilter(filter, config.table);
		}
	}

	if (config.groupBy) {
		if (config.groupBy.length > 5) {
			throw new CustomQueryValidationError(
				"Maximum 5 GROUP BY fields allowed",
				"groupBy"
			);
		}
		for (const field of config.groupBy) {
			if (typeof field !== "string" || !isValidColumn(config.table, field)) {
				throw new CustomQueryValidationError(
					`Invalid GROUP BY column for table "${config.table}"`,
					"groupBy"
				);
			}
		}
	}
}

/**
 * Build the SQL query from a validated configuration
 */
function buildSQL(
	config: CustomQueryConfig,
	websiteId: string,
	startDate: string,
	endDate: string,
	timezone: string,
	limit: number
): { sql: string; params: Record<string, unknown> } {
	if (typeof config.table !== "string") {
		throw new CustomQueryValidationError("Invalid table configuration");
	}
	const table = getTableDefinition(config.table);
	if (!table) {
		throw new CustomQueryValidationError("Table not found");
	}

	const params: Record<string, unknown> = {
		website_id: websiteId,
		start_date: startDate,
		end_date: endDate,
	};

	const selectExpressions = config.selects.map((select: CustomQuerySelect) => {
		const sqlExpr = aggregateToSQL(select.aggregate, select.field);

		const autoAlias = `${select.aggregate}_${select.field === "*" ? "all" : select.field}`;

		let alias = autoAlias;
		if (select.alias) {
			if (!isValidIdentifier(select.alias)) {
				throw new CustomQueryValidationError(
					`Invalid alias "${select.alias}". Aliases must be valid SQL identifiers (letters, numbers, underscores only, starting with letter/underscore).`,
					"selects"
				);
			}
			alias = select.alias;
		}

		return `${sqlExpr} AS ${alias}`;
	});

	// Add GROUP BY fields to SELECT if present
	if (config.groupBy && config.groupBy.length > 0) {
		for (const field of config.groupBy) {
			if (!selectExpressions.some((expr: string) => expr.includes(field))) {
				selectExpressions.unshift(field);
			}
		}
	}

	// Build WHERE clause
	const whereConditions: string[] = [
		`${table.clientIdField} = {website_id:String}`,
		`${table.primaryTimeField} >= parseDateTimeBestEffort({start_date:String}, {timezone:String})`,
		`${table.primaryTimeField} <= parseDateTimeBestEffort({end_date:String}, {timezone:String})`,
	];
	params.timezone = timezone;

	if (config.filters) {
		for (const [index, filter] of config.filters.entries()) {
			const paramName = `filter_${index}`;
			whereConditions.push(
				operatorToSQL(filter.field, filter.operator, paramName)
			);
			params[paramName] = prepareFilterValue(filter.operator, filter.value);
		}
	}

	// Build GROUP BY clause
	const groupByClause =
		config.groupBy && config.groupBy.length > 0
			? `GROUP BY ${config.groupBy.join(", ")}`
			: "";

	// Build ORDER BY clause (order by first aggregate descending)
	const firstAlias =
		config.selects[0]?.alias ||
		`${config.selects[0]?.aggregate}_${config.selects[0]?.field === "*" ? "all" : config.selects[0]?.field}`;
	const orderByClause =
		config.groupBy && config.groupBy.length > 0
			? `ORDER BY ${firstAlias} DESC`
			: "";

	const sql = `
		SELECT ${selectExpressions.join(", ")}
		FROM ${table.database}.${table.name}
		WHERE ${whereConditions.join(" AND ")}
		${groupByClause}
		${orderByClause}
		LIMIT ${limit}
	`.trim();

	return { sql, params };
}

/**
 * Execute a custom query
 */
export async function executeCustomQuery(
	request: CustomQueryRequest,
	websiteId: string
): Promise<CustomQueryResponse> {
	const startTime = Date.now();

	try {
		// Validate the query configuration
		validateQueryConfig(request.query);

		const timezone = request.timezone || "UTC";
		const limit = Math.max(1, Math.min(request.limit || 1000, 10_000));

		// Build the SQL
		const { sql, params } = buildSQL(
			request.query,
			websiteId,
			request.startDate,
			request.endDate,
			timezone,
			limit
		);

		// Execute the query with a timeout
		const result = await chQuery<Record<string, unknown>>(sql, params);

		return {
			success: true,
			data: result,
			meta: {
				rowCount: result.length,
				executionTime: Date.now() - startTime,
			},
		};
	} catch (error) {
		if (error instanceof CustomQueryValidationError) {
			const isDevelopment = process.env.NODE_ENV === "development";
			return {
				success: false,
				error: isDevelopment
					? error.message
					: "Invalid query configuration. Please check your query parameters.",
			};
		}

		useLogger().error(
			error instanceof Error ? error : new Error(String(error)),
			{ customQuery: true }
		);
		const isDevelopment = process.env.NODE_ENV === "development";
		return {
			success: false,
			error: isDevelopment
				? error instanceof Error
					? error.message
					: "Query execution failed"
				: "Query execution failed. Please try again or contact support.",
		};
	}
}
