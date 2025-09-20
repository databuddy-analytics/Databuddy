import { chQueryWithMeta, TABLE_NAMES } from '@databuddy/db';
import { Elysia, t } from 'elysia';
import { getApiKeyFromHeader, hasWebsiteScope } from '../lib/api-key';

//

const CustomSQLRequestSchema = t.Object({
	query: t.String({ minLength: 1, maxLength: 5000 }),
	clientId: t.String({ minLength: 1 }),
	parameters: t.Optional(
		t.Record(t.String(), t.Union([t.String(), t.Number(), t.Boolean()]))
	),
});

type CustomSQLRequestType = {
	query: string;
	clientId: string;
	parameters?: Record<string, string | number | boolean>;
};

const ALLOWED_OPERATIONS = [
	'SELECT',
	'WITH',
	'FROM',
	'WHERE',
	'GROUP BY',
	'ORDER BY',
	'HAVING',
	'LIMIT',
	'OFFSET',
	'JOIN',
	'LEFT JOIN',
	'RIGHT JOIN',
	'INNER JOIN',
	'UNION',
	'UNION ALL',
	'JSONExtract',
	'JSONExtractString',
	'JSONExtractInt',
	'JSONExtractFloat',
	'JSONExtractBool',
	'JSONExtractRaw',
	'CASE',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'AS',
	'AND',
	'OR',
	'NOT',
	'IN',
	'EXISTS',
	'BETWEEN',
	'LIKE',
	'ILIKE',
	'COUNT',
	'SUM',
	'AVG',
	'MIN',
	'MAX',
	'UNIQ',
	'DISTINCT',
	'NOW',
	'TODAY',
	'INTERVAL',
	'TODATE',
	'TOSTARTOFMONTH',
	'TOSTARTOFWEEK',
	'TOSTARTOFDAY',
];

const FORBIDDEN_OPERATIONS = [
	'INSERT',
	'UPDATE',
	'DELETE',
	'DROP',
	'CREATE',
	'ALTER',
	'TRUNCATE',
	'REPLACE',
	'MERGE',
	'CALL',
	'EXEC',
	'EXECUTE',
	'DECLARE',
	'SET',
	'USE',
	'SHOW',
	'DESCRIBE',
	'OPTIMIZE',
	'REPAIR',
	'LOCK',
	'UNLOCK',
	'GRANT',
	'REVOKE',
	'COMMIT',
	'ROLLBACK',
	'SAVEPOINT',
	'RELEASE',
	'START TRANSACTION',
	'BEGIN',
	'INFORMATION_SCHEMA',
	'SYSTEM',
	'ADMIN',
	'SUPER',
	'FILE',
	'PROCESS',
	'RELOAD',
	'SHUTDOWN',
	'REFERENCES',
	'INDEX',
	'TRIGGER',
	'EVENT',
	'ROUTINE',
	'HOSTNAME',
	'FQDN',
	'VERSION',
	'UPTIME',
	'GETOSKERNEL',
	'GETCPUCOUNT',
	'GETMEMORYSIZE',
	'READFILE',
	'WRITEFILE',
	'FILESYSTEM',
	'DICTGET',
	'REMOTE',
	'CLUSTER',
	'SHARD',
	'REPLICA',
];

const FORBIDDEN_PATTERNS = [
	/\/\*.*?\*\//gi,
	/--.*$/gm,
	/;\s*$/gm,
	/\bOR\s+1\s*=\s*1\b/gi,
	/\bUNION\s+(?:ALL\s+)?SELECT\b/gi,
	/\b(?:CONCAT|CHAR|ASCII|SUBSTRING|MID|LENGTH)\s*\(/gi,
	/\bSLEEP\s*\(/gi,
	/\bBENCHMARK\s*\(/gi,
	/\bLOAD_FILE\s*\(/gi,
	/\bINTO\s+(?:OUTFILE|DUMPFILE)\b/gi,
	/\bEXTRACTVALUE\s*\(/gi,
	/\bUPDATEXML\s*\(/gi,
	/\bFROM\s+system\./gi,
	/\bJOIN\s+system\./gi,
	/\binformation_schema\./gi,
	/\bdefault\./gi,
	/\burl\s*\(/gi,
	/\bfile\s*\(/gi,
	/\bs3\s*\(/gi,
	/\bhdfs\s*\(/gi,
	/\bmysql\s*\(/gi,
	/\bpostgresql\s*\(/gi,
	/\bremote\s*\(/gi,
	/\bcluster\s*\(/gi,
];

const ALLOWED_TABLES = [
	TABLE_NAMES.events,
	TABLE_NAMES.errors,
	TABLE_NAMES.custom_events,
	TABLE_NAMES.web_vitals,
];

const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

class SQLValidationError extends Error {
	readonly code: string;

	constructor(message: string, code = 'INVALID_SQL') {
		super(message);
		this.name = 'SQLValidationError';
		this.code = code;
	}
}

const TABLE_PATTERN = /(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gi;
const WHERE_PATTERN = /\bWHERE\b/i;
const END_CLAUSE_PATTERN = /\b(GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING)\b/i;
const CLAUSE_PATTERN = /\b(GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING)\b/i;

const QuerySecurityValidator = {
	transformPropertiesSyntax(query: string): string {
		// Simplified: All JSON properties are extracted as strings since JSON stores everything as strings
		const propertiesPattern = /\bproperties\.([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;

		return query.replace(propertiesPattern, (_match, propertyName) => {
			return `JSONExtractString(properties, '${propertyName}')`;
		});
	},

	transformTemplateLiterals(query: string): string {
		let transformedQuery = query.replace(
			/'?\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}'?/gi,
			(_match, paramName) => {
				return `{${paramName}:String}`;
			}
		);

		transformedQuery = transformedQuery.replace(
			/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/gi,
			(_match, paramName) => {
				return `{${paramName}:String}`;
			}
		);

		return transformedQuery;
	},

	// Automatically add :String to parameterized queries for simplicity
	transformParameterSyntax(query: string): string {
		// Match {paramName} but not {paramName:Type}
		const paramPattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/gi;

		return query.replace(paramPattern, (match, paramName) => {
			// Don't transform if it already has a type specification
			if (query.includes(`{${paramName}:`)) {
				return match; // Keep original if type is already specified
			}
			return `{${paramName}:String}`;
		});
	},

	normalizeSQL(query: string): string {
		return query
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/--.*$/gm, '')
			.replace(/\s+/g, ' ')
			.trim()
			.toUpperCase();
	},

	validateForbiddenOperations(normalizedQuery: string): void {
		for (const operation of FORBIDDEN_OPERATIONS) {
			const regex = new RegExp(`\\b${operation}\\b`, 'i');
			if (regex.test(normalizedQuery)) {
				throw new SQLValidationError(
					`Forbidden operation detected: ${operation}`,
					'FORBIDDEN_OPERATION'
				);
			}
		}

		for (const pattern of FORBIDDEN_PATTERNS) {
			if (pattern.test(normalizedQuery)) {
				throw new SQLValidationError(
					'Query contains forbidden pattern or potential injection attempt',
					'FORBIDDEN_PATTERN'
				);
			}
		}
	},

	validateAllowedTables(normalizedQuery: string): void {
		const matches = normalizedQuery.matchAll(TABLE_PATTERN);

		for (const match of matches) {
			const tableName = match[1]?.toLowerCase();
			if (!tableName) {
				continue;
			}

			const isAllowed = ALLOWED_TABLES.some((allowedTable) => {
				const allowedLower = allowedTable.toLowerCase();
				return (
					tableName === allowedLower ||
					tableName === allowedLower.split('.').pop() ||
					allowedLower.endsWith(`.${tableName}`)
				);
			});

			if (!isAllowed) {
				throw new SQLValidationError(
					`Access to table '${tableName}' is not allowed`,
					'FORBIDDEN_TABLE'
				);
			}
		}
	},

	validateQueryStart(normalizedQuery: string): void {
		const startsWithSelect = normalizedQuery.startsWith('SELECT');
		const startsWithWith = normalizedQuery.startsWith('WITH');
		const hasValidStart = startsWithSelect || startsWithWith;
		if (!hasValidStart) {
			throw new SQLValidationError(
				'Query must start with SELECT or WITH',
				'INVALID_QUERY_START'
			);
		}
	},

	validateQueryComplexity(normalizedQuery: string): void {
		const selectMatches = normalizedQuery.match(/\bSELECT\b/g);
		const selectCount = selectMatches ? selectMatches.length : 0;
		if (selectCount > 5) {
			throw new SQLValidationError(
				'Query complexity too high (max 5 SELECT statements allowed)',
				'QUERY_TOO_COMPLEX'
			);
		}

		const unionMatches = normalizedQuery.match(/\bUNION\b/g);
		const unionCount = unionMatches ? unionMatches.length : 0;
		if (unionCount > 2) {
			throw new SQLValidationError(
				'Too many UNION operations (max 2 allowed)',
				'UNION_LIMIT_EXCEEDED'
			);
		}
	},

	validateQuerySyntax(normalizedQuery: string): void {
		if (normalizedQuery.includes('/*') || normalizedQuery.includes('--')) {
			throw new SQLValidationError(
				'Comments are not allowed in queries',
				'COMMENTS_NOT_ALLOWED'
			);
		}

		if (normalizedQuery.includes(';')) {
			throw new SQLValidationError(
				'Multiple statements not allowed',
				'MULTIPLE_STATEMENTS_NOT_ALLOWED'
			);
		}

		if (normalizedQuery.includes('\\') || normalizedQuery.includes('%')) {
			throw new SQLValidationError(
				'Escape sequences and URL encoding not allowed',
				'ENCODING_NOT_ALLOWED'
			);
		}
	},

	validateParenthesesBalance(normalizedQuery: string): void {
		let parenCount = 0;
		for (const char of normalizedQuery) {
			if (char === '(') {
				parenCount++;
			}
			if (char === ')') {
				parenCount--;
			}
			if (parenCount < 0) {
				throw new SQLValidationError(
					'Unbalanced parentheses in query',
					'INVALID_SYNTAX'
				);
			}
		}
		if (parenCount !== 0) {
			throw new SQLValidationError(
				'Unbalanced parentheses in query',
				'INVALID_SYNTAX'
			);
		}
	},

	validateQueryStructure(normalizedQuery: string): void {
		this.validateQueryStart(normalizedQuery);
		this.validateQueryComplexity(normalizedQuery);
		this.validateQuerySyntax(normalizedQuery);
		this.validateParenthesesBalance(normalizedQuery);
	},

	validateClientId(clientId: string): void {
		if (!clientId || typeof clientId !== 'string') {
			throw new SQLValidationError('Invalid client ID', 'INVALID_CLIENT_ID');
		}

		if (!CLIENT_ID_PATTERN.test(clientId)) {
			throw new SQLValidationError(
				'Invalid client ID format',
				'INVALID_CLIENT_ID'
			);
		}
	},

	validateNoDirectClientIdReference(query: string): void {
		const normalizedQuery = query.trim().toUpperCase();
		if (
			normalizedQuery.includes('CLIENT_ID') &&
			!normalizedQuery.includes('{CLIENTID:STRING}')
		) {
			throw new SQLValidationError(
				'Query cannot reference client_id directly - use parameterized queries',
				'CLIENT_REFERENCE_FORBIDDEN'
			);
		}
	},

	injectClientIdFilter(query: string): string {
		const normalizedQuery = query.trim().toUpperCase();

		if (normalizedQuery.startsWith('SELECT')) {
			return this.injectClientIdIntoSelect(query);
		}

		if (normalizedQuery.startsWith('WITH')) {
			return this.handleWithQuery(query);
		}

		throw new SQLValidationError(
			'Unsupported query structure',
			'UNSUPPORTED_QUERY'
		);
	},

	injectClientIdIntoSelect(query: string): string {
		const whereMatch = query.match(WHERE_PATTERN);

		if (whereMatch) {
			return this.addToExistingWhere(query, whereMatch);
		}

		return this.addNewWhere(query);
	},

	addToExistingWhere(query: string, whereMatch: RegExpMatchArray): string {
		const whereIndex = (whereMatch.index ?? 0) + whereMatch[0].length;
		const afterWhere = query.substring(whereIndex);
		const endClauseMatch = afterWhere.match(END_CLAUSE_PATTERN);

		if (endClauseMatch) {
			const whereCondition = afterWhere.substring(0, endClauseMatch.index ?? 0);
			const remainingClauses = afterWhere.substring(endClauseMatch.index ?? 0);
			const beforeWhere = query.substring(0, whereIndex);

			return `${beforeWhere} client_id = {clientId:String} AND (${whereCondition.trim()}) ${remainingClauses}`;
		}

		const beforeWhere = query.substring(0, whereIndex);
		return `${beforeWhere} client_id = {clientId:String} AND (${afterWhere.trim()})`;
	},

	addNewWhere(query: string): string {
		const clauseMatch = query.match(CLAUSE_PATTERN);

		if (clauseMatch) {
			const clauseIndex = clauseMatch.index ?? 0;
			const beforeClause = query.substring(0, clauseIndex);
			const afterClause = query.substring(clauseIndex);
			return `${beforeClause} WHERE client_id = {clientId:String} ${afterClause}`;
		}

		return `${query} WHERE client_id = {clientId:String}`;
	},

	handleWithQuery(query: string): string {
		const normalizedQuery = query.trim().toUpperCase();
		if (!normalizedQuery.includes('CLIENT_ID = {CLIENTID:STRING}')) {
			throw new SQLValidationError(
				'WITH queries must include client filtering using WHERE client_id = {clientId:String}',
				'WITH_QUERY_REQUIRES_CLIENT_FILTER'
			);
		}
		return query;
	},

	validateClientAccess(query: string, clientId: string): string {
		this.validateClientId(clientId);
		this.validateNoDirectClientIdReference(query);
		return this.injectClientIdFilter(query);
	},

	validateAgainstAttackVectors(query: string): void {
		const attackVectors = [
			/'\s*OR\s*'.*?'\s*=\s*'/gi,
			/'\s*OR\s*1\s*=\s*1/gi,
			/'\s*OR\s*'1'\s*=\s*'1/gi,
			/'\s*AND\s*1\s*=\s*1/gi,
			/WAITFOR\s+DELAY/gi,
			/pg_sleep\s*\(/gi,
			/SLEEP\s*\(/gi,
			/\bIF\s*\(/gi,
			/\bCASE\s+WHEN/gi,
			/CAST\s*\(/gi,
			/CONVERT\s*\(/gi,
			/;\s*DROP/gi,
			/;\s*DELETE/gi,
			/;\s*UPDATE/gi,
			/;\s*INSERT/gi,
		];

		for (const vector of attackVectors) {
			if (vector.test(query)) {
				throw new SQLValidationError(
					'Query matches known attack pattern',
					'ATTACK_PATTERN_DETECTED'
				);
			}
		}
	},

	validateAndSecureQuery(query: string, clientId: string): string {
		try {
			if (!query || typeof query !== 'string') {
				throw new SQLValidationError(
					'Query must be a non-empty string',
					'INVALID_INPUT'
				);
			}

			if (query.length > 5000) {
				throw new SQLValidationError(
					'Query too long (max 5,000 characters)',
					'QUERY_TOO_LONG'
				);
			}

			QuerySecurityValidator.validateAgainstAttackVectors(query);

			// Apply transformations in order
			let transformedQuery =
				QuerySecurityValidator.transformTemplateLiterals(query);
			transformedQuery =
				QuerySecurityValidator.transformPropertiesSyntax(transformedQuery);
			transformedQuery =
				QuerySecurityValidator.transformParameterSyntax(transformedQuery);

			const normalizedQuery =
				QuerySecurityValidator.normalizeSQL(transformedQuery);

			QuerySecurityValidator.validateForbiddenOperations(normalizedQuery);
			QuerySecurityValidator.validateQueryStructure(normalizedQuery);
			QuerySecurityValidator.validateAllowedTables(normalizedQuery);

			return QuerySecurityValidator.validateClientAccess(
				transformedQuery,
				clientId
			);
		} catch (error) {
			if (error instanceof SQLValidationError) {
				console.error('SQL Query Validation Failed:', {
					code: error.code,
					message: error.message,
					clientId,
					originalQuery:
						query.length > 500 ? `${query.substring(0, 500)}...` : query,
					timestamp: new Date().toISOString(),
				});
				throw error;
			}
			console.error('Unexpected validation error:', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
				clientId,
				timestamp: new Date().toISOString(),
			});
			throw error;
		}
	},
};

interface ClickHouseQueryResult {
	data: Record<string, unknown>[];
	meta?: Array<{ name: string; type: string }>;
	execution_time?: number;
	rows_read?: number;
}

async function executeClickHouseQuery(
	query: string,
	parameters: Record<string, unknown> = {}
): Promise<ClickHouseQueryResult> {
	try {
		const result = await chQueryWithMeta(query, parameters);

		return {
			data: result.data,
			meta: result.meta,
			execution_time: result.statistics?.elapsed || undefined,
			rows_read: result.statistics?.rows_read || undefined,
		};
	} catch (error) {
		console.error('ClickHouse Query Execution Error:', {
			error: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined,
			query: query.length > 1000 ? `${query.substring(0, 1000)}...` : query,
			parameters: JSON.stringify(parameters),
			timestamp: new Date().toISOString(),
		});
		throw new Error(
			`ClickHouse query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

// Helper functions to reduce complexity
async function validateAPIKeyAndPermissions(
	apiKey: unknown,
	clientId: string,
	request: Request
) {
	if (!apiKey) {
		console.error('Custom SQL Auth Error:', {
			code: 'AUTH_REQUIRED',
			error: 'API key required for custom SQL access',
			clientId,
			ip:
				request.headers.get('x-forwarded-for') ||
				request.headers.get('x-real-ip') ||
				'unknown',
			userAgent: request.headers.get('user-agent'),
			timestamp: new Date().toISOString(),
		});
		return {
			status: 401,
			response: {
				success: false,
				error: 'API key required for custom SQL access',
				code: 'AUTH_REQUIRED',
			},
		};
	}

	// Type guard for apiKey
	if (
		typeof apiKey !== 'object' ||
		!apiKey ||
		!('scopes' in apiKey) ||
		!('id' in apiKey)
	) {
		console.error('Invalid API key structure');
		return {
			status: 401,
			response: {
				success: false,
				error: 'Invalid API key',
				code: 'INVALID_API_KEY',
			},
		};
	}

	const apiKeyObj = apiKey as { scopes: string[]; id: string };
	const hasCustomSQLScope = apiKeyObj.scopes.includes('write:custom-sql');
	const hasGlobalScope =
		apiKeyObj.scopes.includes('read:data') ||
		apiKeyObj.scopes.includes('read:analytics');

	if (!(hasCustomSQLScope || hasGlobalScope)) {
		console.error('Custom SQL Authorization Error:', {
			code: 'INSUFFICIENT_SCOPE',
			error:
				'API key must have write:custom-sql or read:analytics scope for custom SQL access',
			clientId,
			apiKeyId: apiKeyObj.id,
			scopes: apiKeyObj.scopes,
			ip:
				request.headers.get('x-forwarded-for') ||
				request.headers.get('x-real-ip') ||
				'unknown',
			timestamp: new Date().toISOString(),
		});
		return {
			status: 403,
			response: {
				success: false,
				error:
					'API key must have write:custom-sql or read:analytics scope for custom SQL access',
				code: 'INSUFFICIENT_SCOPE',
			},
		};
	}

	if (!hasCustomSQLScope) {
		const hasAccess = await hasWebsiteScope(
			apiKey as never,
			clientId,
			'read:data'
		);
		if (!hasAccess) {
			console.error('Custom SQL Client Access Error:', {
				code: 'CLIENT_ACCESS_DENIED',
				error: `API key does not have access to client ID: ${clientId}`,
				clientId,
				apiKeyId: apiKeyObj.id,
				scopes: apiKeyObj.scopes,
				ip:
					request.headers.get('x-forwarded-for') ||
					request.headers.get('x-real-ip') ||
					'unknown',
				timestamp: new Date().toISOString(),
			});
			return {
				status: 403,
				response: {
					success: false,
					error: `API key does not have access to client ID: ${clientId}`,
					code: 'CLIENT_ACCESS_DENIED',
				},
			};
		}
	}

	return { status: 200, response: null };
}

const UNKNOWN_COLUMN_REGEX =
	/Unknown expression or function identifier `(\w+)`/;
const TABLE_NOT_FOUND_REGEX = /Table\s+[\w.]*\.(\w+)\s+does not exist/;
const SUBSTITUTION_NOT_SET_REGEX = /Substitution `(\w+)` is not set/;

function parseClickHouseError(errorMessage: string): {
	error: string;
	suggestion?: string;
	code: string;
} {
	// Column not found errors
	if (errorMessage.includes('Unknown expression or function identifier')) {
		const columnMatch = errorMessage.match(UNKNOWN_COLUMN_REGEX);
		if (columnMatch) {
			const column = columnMatch[1];
			let suggestion = '';

			if (column === 'name') {
				suggestion =
					"Did you mean 'event_name'? Custom events use 'event_name' as the column name.";
			} else if (column === 'event') {
				suggestion =
					"Did you mean 'event_name'? Use 'event_name' to filter by event type.";
			} else if (column === 'user_id') {
				suggestion =
					"Did you mean 'anonymous_id'? Use 'anonymous_id' for user identification.";
			} else if (
				column === 'created_at' ||
				column === 'created' ||
				column === 'date'
			) {
				suggestion =
					"Did you mean 'timestamp'? Use 'timestamp' for date/time filtering.";
			} else {
				suggestion = `Column '${column}' not found. Available columns: event_name, anonymous_id, session_id, timestamp, properties, client_id`;
			}

			return {
				error: `Unknown column: ${column}`,
				suggestion,
				code: 'UNKNOWN_COLUMN',
			};
		}
	}

	// Table not found errors
	if (
		errorMessage.includes('Table') &&
		errorMessage.includes('does not exist')
	) {
		const tableMatch = errorMessage.match(TABLE_NOT_FOUND_REGEX);
		if (tableMatch) {
			const table = tableMatch[1];
			return {
				error: `Table '${table}' not found`,
				suggestion:
					'Available tables: analytics.custom_events, analytics.events, analytics.errors, analytics.sessions',
				code: 'UNKNOWN_TABLE',
			};
		}
	}

	// Syntax errors
	if (errorMessage.includes('Syntax error')) {
		return {
			error: 'SQL syntax error',
			suggestion:
				'Check your SQL syntax. Make sure all parentheses, quotes, and keywords are correct.',
			code: 'SYNTAX_ERROR',
		};
	}

	// Property extraction errors
	if (
		errorMessage.includes('properties.') &&
		errorMessage.includes('JSONExtractString')
	) {
		return {
			error: 'Property extraction error',
			suggestion:
				'Use properties.propertyName syntax for JSON properties. All properties are extracted as strings.',
			code: 'PROPERTY_ERROR',
		};
	}

	// Parameter errors
	if (
		errorMessage.includes('Substitution') &&
		errorMessage.includes('is not set')
	) {
		const paramMatch = errorMessage.match(SUBSTITUTION_NOT_SET_REGEX);
		if (paramMatch) {
			const param = paramMatch[1];
			return {
				error: `Missing parameter: ${param}`,
				suggestion: `Make sure to include '${param}' in your parameters JSON object.`,
				code: 'MISSING_PARAMETER',
			};
		}
	}

	// Default case - return the original error but cleaned up
	const cleanError = errorMessage.replace(/\s+/g, ' ').substring(0, 200);
	return {
		error: cleanError,
		code: 'QUERY_ERROR',
	};
}

function handleQueryExecutionError(
	error: unknown,
	body: { clientId: string; query: string },
	apiKey: unknown
) {
	if (error instanceof SQLValidationError) {
		console.error('SQL Validation Error:', {
			code: error.code,
			message: error.message,
			clientId: body.clientId,
			originalQuery: body.query,
			apiKeyId:
				apiKey && typeof apiKey === 'object' && 'id' in apiKey
					? (apiKey as { id: string }).id
					: null,
			timestamp: new Date().toISOString(),
		});
		return {
			status: 400,
			response: {
				success: false,
				error: error.message,
				code: error.code,
			},
		};
	}

	console.error('Custom SQL Execution Error:', {
		error: error instanceof Error ? error.message : 'Unknown error',
		stack: error instanceof Error ? error.stack : undefined,
		clientId: body.clientId,
		originalQuery: body.query,
		apiKeyId:
			apiKey && typeof apiKey === 'object' && 'id' in apiKey
				? (apiKey as { id: string }).id
				: null,
		timestamp: new Date().toISOString(),
	});

	// Parse ClickHouse errors for better user feedback
	if (error instanceof Error) {
		const parsedError = parseClickHouseError(error.message);
		return {
			status: 400,
			response: {
				success: false,
				error: parsedError.error,
				suggestion: parsedError.suggestion,
				code: parsedError.code,
			},
		};
	}

	return {
		status: 500,
		response: {
			success: false,
			error: 'Unknown query execution error occurred.',
			code: 'EXECUTION_ERROR',
		},
	};
}

export const customSQL = new Elysia({ prefix: '/v1/custom-sql' })
	// .use(
	// 	createCustomRateLimitMiddleware(30, '1 m', 'expensive', {
	// 		skipAuth: true,
	// 		errorMessage:
	// 			'Custom SQL rate limit exceeded. Maximum 30 queries per minute allowed.',
	// 	})
	// )
	.derive(({ request }) => {
		const startTime = Date.now();
		return {
			requestStartTime: startTime,
			logContext: {
				url: request.url,
				method: request.method,
				userAgent: request.headers.get('user-agent'),
				ip:
					request.headers.get('x-forwarded-for') ||
					request.headers.get('x-real-ip') ||
					'unknown',
			},
		};
	})
	.post(
		'/execute',
		async ({
			body,
			request,
			set,
		}: {
			body: CustomSQLRequestType;
			request: Request;
			set: { status: number };
			requestStartTime: number;
			logContext: {
				url: string;
				method: string;
				userAgent: string | null;
				ip: string;
			};
		}) => {
			const apiKey = await getApiKeyFromHeader(request.headers);

			try {
				// Validate API key and permissions
				const authResult = await validateAPIKeyAndPermissions(
					apiKey,
					body.clientId,
					request
				);
				if (authResult.status !== 200) {
					set.status = authResult.status;
					return authResult.response;
				}

				const secureQuery = QuerySecurityValidator.validateAndSecureQuery(
					body.query,
					body.clientId
				);

				const queryParameters = {
					clientId: body.clientId,
					...body.parameters,
				};

				const result = await executeClickHouseQuery(
					secureQuery,
					queryParameters
				);

				return {
					success: true,
					data: result.data,
					meta: {
						rowCount: result.data.length,
						columns: result.meta?.map((col) => col.name) || [],
						executionTime: result.execution_time || null,
						rowsRead: result.rows_read || null,
						clientId: body.clientId,
					},
				};
			} catch (error) {
				const errorResult = handleQueryExecutionError(error, body, apiKey);
				set.status = errorResult.status;
				return errorResult.response;
			}
		},
		{
			body: CustomSQLRequestSchema,
		}
	)
	.get('/schema', () => {
		return {
			success: true,
			schema: {
				allowedTables: ALLOWED_TABLES,
				allowedOperations: ALLOWED_OPERATIONS,
				forbiddenOperations: FORBIDDEN_OPERATIONS,
				maxQueryLength: 5000,
				maxNestedSelects: 3,
				parameterization: {
					clientIdParameter: '{clientId:String}',
					required: 'All queries must use parameterized client filtering',
					supportedSyntax: [
						'Template literals: $[paramName] converted to {paramName:String}',
						'Simple parameters: {paramName} converted to {paramName:String}',
						'Typed parameters: {paramName:Type} (unchanged)',
					],
					examples: [
						'$[workspaceId] becomes {workspaceId:String}',
						'{cutoffTimestamp} becomes {cutoffTimestamp:String}',
						'{userId:Int32} remains {userId:Int32} (unchanged)',
					],
				},
				propertiesSyntax: {
					description:
						'Automatic JSONExtract transformation from properties.X syntax - all properties extracted as strings',
					syntax: 'properties.property_name',
					note: 'All JSON properties are extracted as strings since JSON stores values as strings',
					examples: [
						'properties.browser_name',
						'properties.user_id',
						"properties.is_active = 'true'",
						"properties.count = '42'",
					],
					extraction: "JSONExtractString(properties, 'property_name')",
				},
			},
		};
	})
	.get('/examples', () => {
		return {
			success: true,
			examples: [
				{
					name: 'Monthly Events Count',
					description: 'Get monthly event counts for your client',
					query: `
						SELECT
							toStartOfMonth(time) as month_start,
							count() as event_count
						FROM analytics.events
						WHERE
							time >= now() - INTERVAL 6 MONTH
						GROUP BY month_start
						ORDER BY month_start DESC
					`.trim(),
				},
				{
					name: 'Monthly API Requests with Simplified Syntax',
					description:
						'Example using simplified parameter syntax - {paramName} auto-converts to {paramName:String}. Also supports $[paramName] template literals.',
					query: `
						SELECT 
							toStartOfMonth(timestamp) as month_start,
							countIf(properties.success = 'true') as success,
							count() as total_requests
						FROM analytics.custom_events
						WHERE 
							name = 'api_request'
							AND properties.workspaceId = {workspaceId}
							AND timestamp >= toDateTime({cutoffTimestamp})
						GROUP BY month_start
						ORDER BY month_start DESC
						LIMIT 24
					`.trim(),
				},
				{
					name: 'Top Pages by Views',
					description: 'Get most popular pages',
					query: `
						SELECT
							path,
							count() as page_views,
							uniq(session_id) as unique_sessions
						FROM analytics.events
						WHERE
							time >= now() - INTERVAL 30 DAY
							AND event_name = 'page_view'
						GROUP BY path
						ORDER BY page_views DESC
						LIMIT 10
					`.trim(),
				},
				{
					name: 'Browser Analytics (simplified properties syntax)',
					description:
						'Analyze browser usage using simplified properties.X syntax',
					query: `
						SELECT
							properties.browser_name,
							count() as events,
							uniq(anonymous_id) as unique_users
						FROM analytics.events
						WHERE
							time >= now() - INTERVAL 7 DAY
							AND properties.browser_name != ''
						GROUP BY properties.browser_name
						ORDER BY events DESC
					`.trim(),
				},
				{
					name: 'User Analytics (simplified properties)',
					description:
						'Analyze user behavior using simplified properties - all extracted as strings',
					query: `
						SELECT
							properties.user_id as user_id,
							properties.is_premium as is_premium,
							properties.session_duration as session_duration,
							count() as total_events
						FROM analytics.events
						WHERE
							time >= now() - INTERVAL 30 DAY
							AND properties.user_id != ''
							AND properties.is_premium = 'true'
						GROUP BY
							properties.user_id,
							properties.is_premium,
							properties.session_duration
						ORDER BY total_events DESC
						LIMIT 20
					`.trim(),
				},
				{
					name: 'Error Events Analysis',
					description: 'Analyze error events',
					query: `
						SELECT
							path,
							count() as error_count
						FROM analytics.errors
						WHERE
							timestamp >= now() - INTERVAL 7 DAY
						GROUP BY path
						ORDER BY error_count DESC
						LIMIT 10
					`.trim(),
				},
			],
		};
	});
