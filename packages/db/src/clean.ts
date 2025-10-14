import { sql } from 'drizzle-orm';
import { db } from './client';

(async () => {
    try {
        console.log('Cleaning PostgreSQL database...');

        // List of all tables in your schema (add any missing ones)
        const tables = [
            'ab_experiments',
            'ab_goals',
            'ab_variants',
            'account',
            'apikey',
            'apikey_access',
            'funnel_definitions',
            'funnel_goals',
            'invitation',
            'member',
            'organization',
            'session',
            'team',
            'two_factor',
            'user',
            'user_preferences',
            'websites',
        ];

        // Drop all tables (with CASCADE to handle dependencies)
        for (const table of tables) {
            await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(table)} CASCADE`);
            console.log(`Dropped table: ${table}`);
        }

        console.log('PostgreSQL database cleaned successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Failed to clean PostgreSQL database:', error);
        process.exit(1);
    }
})();