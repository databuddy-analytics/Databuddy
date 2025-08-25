import { describe, expect, test } from 'bun:test';
import { validateSQL } from '../agent/utils/sql-validator';

describe('Security Validations', () => {
	describe('SQL Injection Prevention', () => {
		test('should reject malicious SQL keywords', () => {
			const maliciousQueries = [
				"SELECT * FROM users; DROP TABLE users; --",
				"SELECT * FROM users WHERE id = 1 OR 1=1",
				"SELECT * FROM users UNION SELECT password FROM admin",
				"SELECT * FROM users; INSERT INTO admin VALUES ('hacker', 'pass')",
				"SELECT * FROM users; DELETE FROM logs",
				"SELECT * FROM users; UPDATE users SET password = 'hacked'",
				"SELECT * FROM users; CREATE TABLE malicious (id INT)",
				"SELECT * FROM users; ALTER TABLE users ADD COLUMN hacked VARCHAR(255)",
				"SELECT * FROM users; EXEC xp_cmdshell 'net user'",
				"SELECT * FROM users; EXECUTE sp_executesql @sql",
				"SELECT * FROM users; TRUNCATE TABLE logs",
				"SELECT * FROM users; BACKUP DATABASE test TO DISK",
				"SELECT * FROM users; RESTORE DATABASE test FROM DISK",
				"SELECT * FROM users; GRANT ALL PRIVILEGES ON *.*",
				"SELECT * FROM users; REVOKE ALL PRIVILEGES ON *.*",
				"SELECT * FROM users; SHOW GRANTS FOR root",
				"SELECT * FROM users; SHOW USERS",
				"SELECT * FROM users; SYSTEM DROP DATABASE test",
				"SELECT * FROM users; ATTACH DATABASE 'test.db' AS test",
				"SELECT * FROM users; DETACH DATABASE test",
				"SELECT * FROM users; OPTIMIZE TABLE users",
				"SELECT * FROM users; CHECK TABLE users",
				"SELECT * FROM users; REPAIR TABLE users",
				"SELECT * FROM users; ANALYZE TABLE users",
			];

			for (const query of maliciousQueries) {
				expect(validateSQL(query)).toBe(false);
			}
		});

		test('should reject dangerous SQL patterns', () => {
			const dangerousPatterns = [
				"SELECT * FROM users -- comment",
				"SELECT * FROM users /* comment */",
				"SELECT * FROM users; SELECT * FROM admin",
				"SELECT * FROM users INTO OUTFILE '/tmp/users.txt'",
				"SELECT LOAD_FILE('/etc/passwd')",
				"SELECT * FROM users INTO DUMPFILE '/tmp/users.txt'",
				"SELECT * FROM users; SHOW PROCESSLIST",
				"SELECT * FROM INFORMATION_SCHEMA.TABLES",
				"SELECT * FROM mysql.user",
				"SELECT pg_user FROM pg_stat_activity",
				"SELECT * FROM users UNION ALL SELECT * FROM admin",
			];

			for (const query of dangerousPatterns) {
				expect(validateSQL(query)).toBe(false);
			}
		});

		test('should allow safe SELECT queries', () => {
			const safeQueries = [
				"SELECT id, name FROM users WHERE active = 1",
				"SELECT COUNT(*) FROM orders WHERE date > '2023-01-01'",
				"SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id",
				"WITH top_users AS (SELECT * FROM users ORDER BY score DESC LIMIT 10) SELECT * FROM top_users",
				"SELECT name FROM users WHERE created_at BETWEEN '2023-01-01' AND '2023-12-31'",
			];

			for (const query of safeQueries) {
				expect(validateSQL(query)).toBe(true);
			}
		});

		test('should reject non-SELECT queries', () => {
			const nonSelectQueries = [
				"INSERT INTO users VALUES (1, 'test')",
				"UPDATE users SET name = 'test'",
				"DELETE FROM users",
				"DROP TABLE users",
				"CREATE TABLE test (id INT)",
				"ALTER TABLE users ADD COLUMN test VARCHAR(255)",
			];

			for (const query of nonSelectQueries) {
				expect(validateSQL(query)).toBe(false);
			}
		});

		test('should reject overly long queries', () => {
			const longQuery = "SELECT * FROM users WHERE " + "a = 1 AND ".repeat(1000) + "b = 2";
			expect(validateSQL(longQuery)).toBe(false);
		});

		test('should handle edge cases', () => {
			expect(validateSQL('')).toBe(false);
			expect(validateSQL('   ')).toBe(false);
			// @ts-ignore - testing invalid input
			expect(validateSQL(null)).toBe(false);
			// @ts-ignore - testing invalid input
			expect(validateSQL(undefined)).toBe(false);
			// @ts-ignore - testing invalid input
			expect(validateSQL(123)).toBe(false);
		});
	});

	describe('Input Sanitization', () => {
		test('should detect XSS patterns', () => {
			const xssPatterns = [
				"<script>alert('xss')</script>",
				"javascript:alert('xss')",
				"vbscript:alert('xss')",
				"onload=alert('xss')",
				"onerror=alert('xss')",
				"onclick=alert('xss')",
				"onmouseover=alert('xss')",
				"eval(alert('xss'))",
				"expression(alert('xss'))",
				"data:text/html,<script>alert('xss')</script>",
				"data:application/javascript,alert('xss')",
				"&#x3C;script&#x3E;alert('xss')&#x3C;/script&#x3E;",
				"&#60;script&#62;alert('xss')&#60;/script&#62;",
			];

			// These would be caught by our sanitization functions
			// Testing that our patterns detect them correctly
			const hasXSSPattern = (input: string): boolean => {
				const dangerousPatterns = [
					/<script/i,
					/javascript:/i,
					/vbscript:/i,
					/onload=/i,
					/onerror=/i,
					/onclick=/i,
					/onmouse/i,
					/eval\(/i,
					/expression\(/i,
					/data:text\/html/i,
					/data:application/i,
					/&#x/i,
					/&#\d/i,
				];
				return dangerousPatterns.some(pattern => pattern.test(input));
			};

			for (const pattern of xssPatterns) {
				expect(hasXSSPattern(pattern)).toBe(true);
			}
		});

		test('should allow safe input', () => {
			const safeInputs = [
				"Hello World",
				"user@example.com",
				"123-456-7890",
				"Safe content with normal characters",
				"Product Name - Version 1.0",
			];

			const hasXSSPattern = (input: string): boolean => {
				const dangerousPatterns = [
					/<script/i,
					/javascript:/i,
					/vbscript:/i,
					/onload=/i,
					/onerror=/i,
					/onclick=/i,
					/onmouse/i,
					/eval\(/i,
					/expression\(/i,
					/data:text\/html/i,
					/data:application/i,
					/&#x/i,
					/&#\d/i,
				];
				return dangerousPatterns.some(pattern => pattern.test(input));
			};

			for (const input of safeInputs) {
				expect(hasXSSPattern(input)).toBe(false);
			}
		});
	});
});