/**
 * Forbidden SQL keywords for security validation.
 * Only SELECT and WITH statements are allowed.
 */
const FORBIDDEN_SQL_KEYWORDS = [
	"INSERT INTO",
	"UPDATE SET",
	"DELETE FROM",
	"DROP TABLE",
	"DROP DATABASE",
	"CREATE TABLE",
	"CREATE DATABASE",
	"ALTER TABLE",
	"EXEC ",
	"EXECUTE ",
	"TRUNCATE",
	"MERGE",
	"BULK",
	"RESTORE",
	"BACKUP",
] as const;

/**
 * Dangerous patterns that could indicate SQL injection attempts.
 */
const DANGEROUS_PATTERNS = [
	/\$\{[^}]+\}/, // ${variable} interpolation
	/'[^']*\+[^']*'/, // String concatenation in quotes
	/"[^"]*\+[^"]*"/, // String concatenation in double quotes
] as const;

/**
 * Validates that a SQL query is safe to execute.
 * Only allows SELECT and WITH statements, blocks dangerous keywords and patterns.
 *
 * @returns true if the query is valid, false otherwise
 */
export function validateSQL(sql: string): boolean {
	const upperSQL = sql.toUpperCase();
	const trimmed = upperSQL.trim();

	// Check for forbidden keywords
	for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
		if (upperSQL.includes(keyword)) {
			return false;
		}
	}

	// Check for dangerous string interpolation patterns
	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(sql)) {
			return false;
		}
	}

	// Only allow SELECT and WITH statements
	return trimmed.startsWith("SELECT") || trimmed.startsWith("WITH");
}

/**
 * Error message for failed SQL validation.
 */
export const SQL_VALIDATION_ERROR =
	"Query failed security validation. Only SELECT and WITH statements are allowed, and string interpolation is forbidden. Use parameterized queries with {paramName:Type} syntax.";
