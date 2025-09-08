import { apikeysRouter } from './routers/apikeys';
import { assistantRouter } from './routers/assistant';
import { autocompleteRouter } from './routers/autocomplete';
import { dbConnectionsRouter } from './routers/db-connections';
import { experimentsRouter } from './routers/experiments';
import { funnelsRouter } from './routers/funnels';
import { goalsRouter } from './routers/goals';
import { integrationsRouter } from './routers/integrations';
import { miniChartsRouter } from './routers/mini-charts';
import { organizationsRouter } from './routers/organizations';
import { performanceRouter } from './routers/performance';
import { preferencesRouter } from './routers/preferences';
import { vercelRouter } from './routers/vercel';
import { websitesRouter } from './routers/websites';
import { createTRPCRouter } from './trpc';

export const appRouter = createTRPCRouter({
	websites: websitesRouter,
	miniCharts: miniChartsRouter,
	funnels: funnelsRouter,
	preferences: preferencesRouter,
	goals: goalsRouter,
	autocomplete: autocompleteRouter,
	apikeys: apikeysRouter,
	experiments: experimentsRouter,
	assistant: assistantRouter,
	organizations: organizationsRouter,
	dbConnections: dbConnectionsRouter,
	performance: performanceRouter,
	integrations: integrationsRouter,
	vercel: vercelRouter,
});

export type AppRouter = typeof appRouter;
