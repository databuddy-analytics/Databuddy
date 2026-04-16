const ALLOWED_TABLE_PREFIX = "analytics.";

function extractTableReferences(sql: string): string[] {
	const refs: string[] = [];
	const pattern = /(?:FROM|JOIN)\s+`?(\w+\.\w+)`?/gi;
	let match = pattern.exec(sql);
	while (match) {
		refs.push(match.at(1) as string);
		match = pattern.exec(sql);
	}
	return refs;
}

export function validateAgentSQL(sql: string): {
	valid: boolean;
	reason: string | null;
} {
	const tableRefs = extractTableReferences(sql);
	for (const ref of tableRefs) {
		if (!ref.toLowerCase().startsWith(ALLOWED_TABLE_PREFIX)) {
			return {
				valid: false,
				reason: `Table "${ref}" is outside the allowed analytics database.`,
			};
		}
	}

	return { valid: true, reason: null };
}

const TENANT_FILTER_PATTERN = /client_id\s*=\s*\{websiteId\s*:\s*String\}/i;

export function requiresTenantFilter(sql: string): boolean {
	return TENANT_FILTER_PATTERN.test(sql);
}

export const AGENT_SQL_VALIDATION_ERROR =
	"Query failed security validation. Only SELECT/WITH against analytics.* tables are allowed. " +
	"Use parameterized queries with {paramName:Type} syntax and include WHERE client_id = {websiteId:String}.";
