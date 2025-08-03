const FORBIDDEN_SQL_KEYWORDS = [
	'INSERT INTO',
	'UPDATE SET',
	'DELETE FROM',
	'DROP TABLE',
	'DROP DATABASE',
	'CREATE TABLE',
	'CREATE DATABASE',
	'ALTER TABLE',
	'EXEC ',
	'EXECUTE ',
	'TRUNCATE',
	'MERGE',
	'BULK',
	'RESTORE',
	'BACKUP',
] as const;

export function validateSQL(sql: string): boolean {
	const upperSQL = sql.toUpperCase();
	const trimmed = upperSQL.trim();

	// Check for dangerous keyword patterns
	for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
		if (upperSQL.includes(keyword)) {
			return false;
		}
	}

	// Must start with SELECT or WITH (for CTEs)
	return trimmed.startsWith('SELECT') || trimmed.startsWith('WITH');
}
