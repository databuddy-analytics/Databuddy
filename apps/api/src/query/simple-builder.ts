import { chQuery } from '@databuddy/db';
import { validateSQL } from '../agent/utils/sql-validator';
import type { DeviceType } from './screen-resolution-to-device-type';
import type {
	CompiledQuery,
	Filter,
	QueryRequest,
	SimpleQueryConfig,
} from './types';
import { FilterOperators } from './types';
import { applyPlugins } from './utils';

// Constants for special filter fields to prevent typos
const SPECIAL_FILTER_FIELDS = {
	PATH: 'path',
	REFERRER: 'referrer',
	DEVICE_TYPE: 'device_type',
} as const;

// Helper function to normalize user input for referrer filters
function normalizeReferrerFilterValue(value: string): string {
	const lowerValue = value.toLowerCase();

	// Map common user inputs to normalized referrer values
	const referrerMappings: Record<string, string> = {
		direct: 'direct',
		google: 'https://google.com',
		'google.com': 'https://google.com',
		'www.google.com': 'https://google.com',
		facebook: 'https://facebook.com',
		'facebook.com': 'https://facebook.com',
		'www.facebook.com': 'https://facebook.com',
		twitter: 'https://twitter.com',
		'twitter.com': 'https://twitter.com',
		'www.twitter.com': 'https://twitter.com',
		't.co': 'https://twitter.com',
		instagram: 'https://instagram.com',
		'instagram.com': 'https://instagram.com',
		'www.instagram.com': 'https://instagram.com',
		'l.instagram.com': 'https://instagram.com',
	};

	// Check if the input matches any known mapping
	if (referrerMappings[lowerValue]) {
		return referrerMappings[lowerValue];
	}

	// If the value already looks like a URL, return as-is
	if (value.startsWith('http://') || value.startsWith('https://')) {
		return value;
	}

	// For other domains, add https:// prefix if it looks like a domain
	if (value.includes('.') && !value.includes(' ')) {
		return `https://${value}`;
	}

	// Return original value if no transformation is needed
	return value;
}

export class SimpleQueryBuilder {
	private config: SimpleQueryConfig;
	private request: QueryRequest;
	private websiteDomain?: string | null;

	constructor(
		config: SimpleQueryConfig,
		request: QueryRequest,
		websiteDomain?: string | null
	) {
		this.config = config;
		this.request = request;
		this.websiteDomain = websiteDomain;
	}

	private getDeviceTypeFilterCondition(deviceType: DeviceType): string {
		// Create SQL condition that matches the same logic as mapScreenResolutionToDeviceType
		// This replicates the heuristics from screen-resolution-to-device-type.ts in SQL

		// First, get common/known resolutions for exact matches
		const commonResolutions: Record<string, DeviceType> = {
			'896x414': 'mobile',
			'844x390': 'mobile',
			'932x430': 'mobile',
			'800x360': 'mobile',
			'780x360': 'mobile',
			'736x414': 'mobile',
			'667x375': 'mobile',
			'640x360': 'mobile',
			'568x320': 'mobile',
			'1366x1024': 'tablet',
			'1280x800': 'tablet',
			'1180x820': 'tablet',
			'1024x768': 'tablet',
			'1280x720': 'tablet',
			'1366x768': 'laptop',
			'1440x900': 'laptop',
			'1536x864': 'laptop',
			'1920x1080': 'desktop',
			'2560x1440': 'desktop',
			'3840x2160': 'desktop',
			'3440x1440': 'ultrawide',
			'3840x1600': 'ultrawide',
			'5120x1440': 'ultrawide',
		};

		const exactMatches = Object.entries(commonResolutions)
			.filter(([_, type]) => type === deviceType)
			.map(([resolution, _]) => `'${resolution}'`)
			.join(', ');

		// SQL for parsing resolution dimensions with error handling
		const widthExpr =
			"toFloat64(if(position(screen_resolution, 'x') > 0, substring(screen_resolution, 1, position(screen_resolution, 'x') - 1), NULL))";
		const heightExpr =
			"toFloat64(if(position(screen_resolution, 'x') > 0, substring(screen_resolution, position(screen_resolution, 'x') + 1), NULL))";
		const longSideExpr = `greatest(${widthExpr}, ${heightExpr})`;
		const shortSideExpr = `least(${widthExpr}, ${heightExpr})`;
		const aspectExpr = `${longSideExpr} / ${shortSideExpr}`;

		// Device type heuristics (matching screen-resolution-to-device-type.ts logic)
		const heuristicCondition = (() => {
			switch (deviceType) {
				case 'mobile':
					return `(${shortSideExpr} <= 480 AND ${shortSideExpr} IS NOT NULL)`;
				case 'tablet':
					return `(${shortSideExpr} <= 900 AND ${shortSideExpr} > 480 AND ${shortSideExpr} IS NOT NULL)`;
				case 'laptop':
					return `(${longSideExpr} <= 1600 AND ${shortSideExpr} > 900 AND ${longSideExpr} IS NOT NULL)`;
				case 'desktop':
					return `(${longSideExpr} <= 3000 AND ${longSideExpr} > 1600 AND ${longSideExpr} IS NOT NULL)`;
				case 'ultrawide':
					return `(${aspectExpr} >= 2.0 AND ${longSideExpr} >= 2560 AND ${longSideExpr} IS NOT NULL)`;
				case 'watch':
					return `(${longSideExpr} <= 400 AND ${aspectExpr} >= 0.85 AND ${aspectExpr} <= 1.15 AND ${longSideExpr} IS NOT NULL)`;
				default:
					return '1 = 0'; // Never matches
			}
		})();

		// Combine exact matches and heuristics
		if (exactMatches) {
			return `(screen_resolution IN (${exactMatches}) OR ${heuristicCondition})`;
		}
		return heuristicCondition;
	}

	private buildFilter(filter: Filter, index: number) {
		if (
			this.config.allowedFilters &&
			!this.config.allowedFilters.includes(filter.field)
		) {
			throw new Error(`Filter on field '${filter.field}' is not permitted.`);
		}
		const key = `f${index}`;
		const operator = FilterOperators[filter.op];

		// Special handling for path filters - apply same normalization as used in queries
		if (filter.field === SPECIAL_FILTER_FIELDS.PATH) {
			const normalizedPathExpression =
				"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END";

			if (filter.op === 'like') {
				return {
					clause: `${normalizedPathExpression} ${operator} {${key}:String}`,
					params: { [key]: `%${filter.value}%` },
				};
			}

			if (filter.op === 'in' || filter.op === 'notIn') {
				const values = Array.isArray(filter.value)
					? filter.value
					: [filter.value];
				return {
					clause: `${normalizedPathExpression} ${operator} {${key}:Array(String)}`,
					params: { [key]: values },
				};
			}

			return {
				clause: `${normalizedPathExpression} ${operator} {${key}:String}`,
				params: { [key]: filter.value },
			};
		}

		// Special handling for referrer filters - apply same normalization as used in queries
		if (filter.field === SPECIAL_FILTER_FIELDS.REFERRER) {
			const normalizedReferrerExpression =
				'CASE ' +
				"WHEN referrer = '' OR referrer IS NULL THEN 'direct' " +
				"WHEN domain(referrer) LIKE '%.google.com%' OR domain(referrer) LIKE 'google.com%' THEN 'https://google.com' " +
				"WHEN domain(referrer) LIKE '%.facebook.com%' OR domain(referrer) LIKE 'facebook.com%' THEN 'https://facebook.com' " +
				"WHEN domain(referrer) LIKE '%.twitter.com%' OR domain(referrer) LIKE 'twitter.com%' OR domain(referrer) LIKE 't.co%' THEN 'https://twitter.com' " +
				"WHEN domain(referrer) LIKE '%.instagram.com%' OR domain(referrer) LIKE 'instagram.com%' OR domain(referrer) LIKE 'l.instagram.com%' THEN 'https://instagram.com' " +
				"ELSE concat('https://', domain(referrer)) " +
				'END';

			if (filter.op === 'like') {
				// For 'like' operations, we need to handle user-friendly input
				// If user types "Google", they want to match referrers like 'https://google.com'
				const lowerValue = String(filter.value).toLowerCase();
				let searchValue = filter.value;

				// Map common search terms to more specific patterns
				if (lowerValue === 'direct') {
					searchValue = 'direct';
				} else if (lowerValue === 'google') {
					searchValue = 'google.com';
				} else if (lowerValue === 'facebook') {
					searchValue = 'facebook.com';
				} else if (lowerValue === 'twitter') {
					searchValue = 'twitter.com';
				} else if (lowerValue === 'instagram') {
					searchValue = 'instagram.com';
				}

				return {
					clause: `${normalizedReferrerExpression} ${operator} {${key}:String}`,
					params: { [key]: `%${searchValue}%` },
				};
			}

			if (filter.op === 'in' || filter.op === 'notIn') {
				const values = Array.isArray(filter.value)
					? filter.value.map((v) => normalizeReferrerFilterValue(String(v)))
					: [normalizeReferrerFilterValue(String(filter.value))];
				return {
					clause: `${normalizedReferrerExpression} ${operator} {${key}:Array(String)}`,
					params: { [key]: values },
				};
			}

			// For exact matches (eq, ne), normalize the user input to match the normalized referrer expression
			const normalizedValue = normalizeReferrerFilterValue(
				String(filter.value)
			);
			return {
				clause: `${normalizedReferrerExpression} ${operator} {${key}:String}`,
				params: { [key]: normalizedValue },
			};
		}

		// Special handling for device_type filters - convert to screen_resolution filters
		if (
			filter.field === SPECIAL_FILTER_FIELDS.DEVICE_TYPE &&
			typeof filter.value === 'string'
		) {
			const deviceType = filter.value as DeviceType;
			const condition = this.getDeviceTypeFilterCondition(deviceType);

			// Return the condition directly without parameters since it's self-contained
			return {
				clause: condition,
				params: {},
			};
		}

		if (filter.op === 'like') {
			return {
				clause: `${filter.field} ${operator} {${key}:String}`,
				params: { [key]: `%${filter.value}%` },
			};
		}

		if (filter.op === 'in' || filter.op === 'notIn') {
			const values = Array.isArray(filter.value)
				? filter.value
				: [filter.value];
			return {
				clause: `${filter.field} ${operator} {${key}:Array(String)}`,
				params: { [key]: values },
			};
		}

		return {
			clause: `${filter.field} ${operator} {${key}:String}`,
			params: { [key]: filter.value },
		};
	}

	private replaceDomainPlaceholders(sql: string): string {
		if (!this.websiteDomain) {
			return sql
				.replace(/domain\(referrer\) != '\{websiteDomain\}'/g, '1=1')
				.replace(/NOT domain\(referrer\) ILIKE '%.{websiteDomain}'/g, '1=1')
				.replace(
					/domain\(referrer\) NOT IN \('localhost', '127\.0\.0\.1'\)/g,
					'1=1'
				);
		}

		return sql
			.replace(/\{websiteDomain\}/g, this.websiteDomain)
			.replace(/%.{websiteDomain}/g, `%.${this.websiteDomain}`);
	}

	private formatDateTime(dateStr: string): string {
		const parts = dateStr.split('.');
		return parts[0]?.replace('T', ' ') || dateStr;
	}

	compile(): CompiledQuery {
		if (this.config.customSql) {
			const whereClauseParams: Record<string, Filter['value']> = {};
			const whereClause = this.buildWhereClauseFromFilters(whereClauseParams);
			const result = this.config.customSql(
				this.request.projectId,
				this.formatDateTime(this.request.from),
				this.formatDateTime(this.request.to),
				this.request.filters,
				this.request.timeUnit,
				this.request.limit,
				this.request.offset,
				this.request.timezone,
				whereClause,
				whereClauseParams
			);

			if (typeof result === 'string') {
				return { sql: result, params: {} };
			}
			return { sql: result.sql, params: result.params };
		}

		return this.buildStandardQuery();
	}

	private buildStandardQuery(): CompiledQuery {
		const params = {
			websiteId: this.request.projectId,
			from: this.formatDateTime(this.request.from),
			to: this.formatDateTime(this.request.to),
		};

		let sql = `SELECT ${this.config.fields?.join(', ') || '*'} FROM ${this.config.table}`;
		const whereClause = this.buildWhereClause(params);

		sql += ` WHERE ${whereClause.join(' AND ')}`;
		sql = this.replaceDomainPlaceholders(sql);
		sql += this.buildGroupByClause();
		sql += this.buildOrderByClause();
		sql += this.buildLimitClause();
		sql += this.buildOffsetClause();

		return { sql, params };
	}

	private buildWhereClause(params: Record<string, Filter['value']>): string[] {
		const whereClause: string[] = [];

		if (this.config.where) {
			whereClause.push(...this.config.where);
		}

		whereClause.push('client_id = {websiteId:String}');

		const timeField = this.config.timeField || 'time';
		whereClause.push(`${timeField} >= parseDateTimeBestEffort({from:String})`);

		const appendEndOfDay = this.config.appendEndOfDayToTo !== false;
		if (appendEndOfDay) {
			whereClause.push(
				`${timeField} <= parseDateTimeBestEffort(concat({to:String}, ' 23:59:59'))`
			);
		} else {
			whereClause.push(`${timeField} <= parseDateTimeBestEffort({to:String})`);
		}

		if (this.request.filters) {
			whereClause.push(...this.buildWhereClauseFromFilters(params));
		}

		return whereClause;
	}

	private buildWhereClauseFromFilters(
		params: Record<string, Filter['value']>
	): string[] {
		const whereClause: string[] = [];

		if (this.request.filters) {
			for (let i = 0; i < this.request.filters.length; i++) {
				const filter = this.request.filters[i];
				if (!filter) {
					continue;
				}
				const { clause, params: filterParams } = this.buildFilter(filter, i);
				whereClause.push(clause);
				Object.assign(params, filterParams);
			}
		}

		return whereClause;
	}

	private buildGroupByClause(): string {
		const groupBy = this.request.groupBy || this.config.groupBy;
		if (!groupBy?.length) {
			return '';
		}

		// Security validation - only block dangerous SQL keywords
		const dangerousKeywords = [
			'DROP',
			'DELETE',
			'INSERT',
			'UPDATE',
			'CREATE',
			'ALTER',
			'TRUNCATE',
			'EXEC',
			'EXECUTE',
		];
		for (const field of groupBy) {
			const upperField = field.toUpperCase();
			for (const keyword of dangerousKeywords) {
				if (upperField.includes(keyword)) {
					throw new Error(
						`Grouping by field '${field}' contains dangerous keyword: ${keyword}`
					);
				}
			}
		}

		return ` GROUP BY ${groupBy.join(', ')}`;
	}

	private buildOrderByClause(): string {
		const orderBy = this.request.orderBy || this.config.orderBy;
		if (!orderBy) {
			return '';
		}

		// Security validation - only block dangerous SQL keywords
		const dangerousKeywords = [
			'DROP',
			'DELETE',
			'INSERT',
			'UPDATE',
			'CREATE',
			'ALTER',
			'TRUNCATE',
			'EXEC',
			'EXECUTE',
		];
		const upperOrderBy = orderBy.toUpperCase();
		for (const keyword of dangerousKeywords) {
			if (upperOrderBy.includes(keyword)) {
				throw new Error(
					`Ordering by field '${orderBy}' contains dangerous keyword: ${keyword}`
				);
			}
		}

		return ` ORDER BY ${orderBy}`;
	}

	private buildLimitClause(): string {
		const limit = this.request.limit || this.config.limit;
		return limit ? ` LIMIT ${limit}` : '';
	}

	private buildOffsetClause(): string {
		return this.request.offset ? ` OFFSET ${this.request.offset}` : '';
	}

	async execute(): Promise<Record<string, unknown>[]> {
		const { sql, params } = this.compile();
		
		// Additional validation of the final SQL
		if (!validateSQL(sql)) {
			throw new Error('Generated SQL failed security validation');
		}
		
		const rawData = await chQuery(sql, params);
		return applyPlugins(rawData, this.config, this.websiteDomain);
	}

	// Validation now delegated to the shared validator
}
