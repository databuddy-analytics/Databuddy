import { apikeysRouter } from './routers/apikeys';
import { assistantRouter } from './routers/assistant';
import { autocompleteRouter } from './routers/autocomplete';
import { experimentsRouter } from './routers/experiments';
import { funnelsRouter } from './routers/funnels';
import { goalsRouter } from './routers/goals';
import { miniChartsRouter } from './routers/mini-charts';
import { preferencesRouter } from './routers/preferences';
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
});

export type AppRouter = typeof appRouter;
