import { agentRouter } from "./routers/agent";
import { annotationsRouter } from "./routers/annotations";
import { apikeysRouter } from "./routers/apikeys";
import { autocompleteRouter } from "./routers/autocomplete";
import { billingRouter } from "./routers/billing";
import { chatRouter } from "./routers/chat";
import { exportRouter } from "./routers/export";
import { flagsRouter } from "./routers/flags";
import { funnelsRouter } from "./routers/funnels";
import { goalsRouter } from "./routers/goals";
import { insightsRouter } from "./routers/insights";
import { linksRouter } from "./routers/links";
import { miniChartsRouter } from "./routers/mini-charts";
import { organizationsRouter } from "./routers/organizations";
import { preferencesRouter } from "./routers/preferences";
import { ssoRouter } from "./routers/sso";
import { targetGroupsRouter } from "./routers/target-groups";
import { uptimeRouter } from "./routers/uptime";
import { websitesRouter } from "./routers/websites";

export const appRouter = {
	annotations: annotationsRouter,
	websites: websitesRouter,
	miniCharts: miniChartsRouter,
	funnels: funnelsRouter,
	preferences: preferencesRouter,
	goals: goalsRouter,
	autocomplete: autocompleteRouter,
	apikeys: apikeysRouter,
	flags: flagsRouter,
	targetGroups: targetGroupsRouter,
	chat: chatRouter,
	agent: agentRouter,
	organizations: organizationsRouter,
	billing: billingRouter,
	export: exportRouter,
	sso: ssoRouter,
	uptime: uptimeRouter,
	insights: insightsRouter,
	links: linksRouter,
};

export type AppRouter = typeof appRouter;
