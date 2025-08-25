const FORBIDDEN_SQL_KEYWORDS: readonly RegExp[] = [
	/\bINSERT\s+INTO\b/i,
	/\bUPDATE\b/i,                // Covers UPDATE ... SET
	/\bDELETE\s+FROM\b/i,
	/\bDROP\s+TABLE\b/i,
	/\bDROP\s+DATABASE\b/i,
	/\bCREATE\s+TABLE\b/i,
	/\bCREATE\s+DATABASE\b/i,
	/\bALTER\s+TABLE\b/i,
	/\bEXEC(UTE)?\b/i,            // Catches EXEC and EXECUTE, with or without space
	/\bTRUNCATE\b/i,
	/\bMERGE\b/i,
	/\bBULK\b/i,
	/\bRESTORE\b/i,
	/\bBACKUP\b/i,
	/\bGRANT\b/i,
	/\bREVOKE\b/i,
	/\bSHOW\s+GRANTS\b/i,
	/\bSHOW\s+USERS\b/i,
	/\bSYSTEM\b/i,
	/\bATTACH\b/i,
	/\bDETACH\b/i,
	/\bOPTIMIZE\b/i,
	/\bCHECK\b/i,
	/\bREPAIR\b/i,
	/\bANALYZE\b/i,
] as const;

const DANGEROUS_PATTERNS = [
	/--/,           // SQL comments
	/\/\*/,         // Multi-line comments start
	/\*\//,         // Multi-line comments end
	/;\s*(DROP|DELETE|UPDATE|INSERT|CREATE|ALTER|TRUNCATE)/i,  // Suspicious stacked queries
	/\bINTO\s+OUTFILE\b/i,  // File operations
	/\bLOAD_FILE\b/i,       // File reading
	/\bINTO\s+DUMPFILE\b/i, // File writing
	/\bSHOW\s+PROCESSLIST\b/i, // Process information
	/\bINFORMATION_SCHEMA\b/i,  // Schema inspection
	/\bMYSQL\b/i,               // MySQL database access
	/\bPG_/i,                   // PostgreSQL functions
	/\bUNION\s+(ALL\s+)?SELECT\b/i, // Union-based injection attempts
	/\bOR\s+[\d'"]+=[\d'"]+/i,      // Classic SQL injection patterns like OR 1=1
	/\bAND\s+[\d'"]+=[\d'"]+/i,     // Classic SQL injection patterns like AND 1=1
] as const;

export function validateSQL(sql: string): boolean {
	if (!sql || typeof sql !== 'string') {
		return false;
	}

	const upperSQL = sql.toUpperCase();
	const trimmed = upperSQL.trim();

	// Check length limit to prevent resource exhaustion
	if (sql.length > 10000) {
		return false;
	}

	// Check for dangerous keyword patterns
	for (const re of FORBIDDEN_SQL_KEYWORDS) {
		if (re.test(sql)) {
			return false;
		}
	}

	// Check for dangerous patterns
	for (const pattern of DANGEROUS_PATTERNS) {
		if (pattern.test(sql)) {
			return false;
		}
	}

	// Must start with SELECT or WITH (for CTEs)
	if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
		return false;
	}

	// Additional validation: Ensure no stacked queries
	const statements = sql.split(';').filter(s => s.trim());
	if (statements.length > 1) {
		return false;
	}

	return true;
}
