/** biome-ignore-all lint/performance/noNamespaceImport: "Required" */

import { drizzle } from 'drizzle-orm/neon-serverless';
import * as relations from './drizzle/relations';
import * as schema from './drizzle/schema';

// Combine schema and relations
const fullSchema = { ...schema, ...relations };

const databaseUrl = process.env.DATABASE_URL as string;

if (!databaseUrl) {
	throw new Error('DATABASE_URL is not set');
}

export const db = drizzle(databaseUrl, { schema: fullSchema });
