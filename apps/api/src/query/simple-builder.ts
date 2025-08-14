import { chQuery } from '@databuddy/db';
import type {
	CompiledQuery,
	Filter,
	QueryRequest,
	SimpleQueryConfig,
} from './types';
import { FilterOperators } from './types';
import { applyPlugins } from './utils';

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

	private buildFilter(filter: Filter, index: number) {
		if (
			this.config.allowedFilters &&
			!this.config.allowedFilters.includes(filter.field)
		) {
			throw new Error(`Filter on field '${filter.field}' is not permitted.`);
		}
		const key = `f${index}`;
		const operator = FilterOperators[filter.op];

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
		return groupBy?.length ? ` GROUP BY ${groupBy.join(', ')}` : '';
	}

	private buildOrderByClause(): string {
		const orderBy = this.request.orderBy || this.config.orderBy;
		return orderBy ? ` ORDER BY ${orderBy}` : '';
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
		const rawData = await chQuery(sql, params);
		return applyPlugins(rawData, this.config, this.websiteDomain);
	}
}
