import readline from 'node:readline';
import { sql } from 'drizzle-orm';
import { db } from './client';

const databaseUrl = process.env.DATABASE_URL as string;

if (!databaseUrl) {
	throw new Error('DATABASE_URL is not set');
}

function getDatabaseName() {
	const url = new URL(databaseUrl);
	return url.pathname.replace('/', '');
}

function askQuestion(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

async function reset() {
	const dbName = getDatabaseName();

	console.log('\x1b[31m'); // red color
	console.log('⚠️  ARE YOU SURE YOU WANT TO DELETE THE DATABASE? (yes/no)');
	console.log('\x1b[0m'); // reset color

	const firstAnswer = await askQuestion('> ');
	if (firstAnswer.toLowerCase() !== 'yes') {
		console.log('❌ Aborted. Database reset canceled.');
		process.exit(0);
	}

	console.log(`\nType the database name "${dbName}" to confirm:`);
	const secondAnswer = await askQuestion('> ');
	if (secondAnswer !== dbName) {
		console.log('❌ Database name did not match. Reset canceled.');
		process.exit(0);
	}

	console.log('⏳ Resetting database...');
	const start = Date.now();

	const query = sql`
		-- Delete all tables
		DO $$ DECLARE
		    r RECORD;
		BEGIN
		    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema()) LOOP
		        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
		    END LOOP;
		END $$;
		
		-- Delete enums
		DO $$ DECLARE
			r RECORD;
		BEGIN
			FOR r IN (
				SELECT t.typname as enum_name
				FROM pg_type t 
					JOIN pg_enum e ON t.oid = e.enumtypid  
					JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
				WHERE n.nspname = current_schema()
			) LOOP
				EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.enum_name);
			END LOOP;
		END $$;
	`;

	await db.execute(query);

	const end = Date.now();
	console.log(`✅ Reset complete. Took ${end - start}ms`);
	process.exit(0);
}

reset().catch((err) => {
	console.error('❌ Reset failed');
	console.error(err);
	process.exit(1);
});
