import { alarmsRouter } from "./routers/alarms";
import { annotationsRouter } from "./routers/annotations";
import { apikeysRouter } from "./routers/apikeys";
import { autocompleteRouter } from "./routers/autocomplete";
import { billingRouter } from "./routers/billing";
import { feedbackRouter } from "./routers/feedback";
import { flagsRouter } from "./routers/flags";
import { funnelsRouter } from "./routers/funnels";
import { goalsRouter } from "./routers/goals";
import { linksRouter } from "./routers/links";
import { organizationsRouter } from "./routers/organizations";
import { preferencesRouter } from "./routers/preferences";
import { revenueRouter } from "./routers/revenue";
import { targetGroupsRouter } from "./routers/target-groups";
import { uptimeRouter } from "./routers/uptime";
import { websitesRouter } from "./routers/websites";

export const appRouter = {
	alarms: alarmsRouter,
	annotations: annotationsRouter,
	websites: websitesRouter,
	funnels: funnelsRouter,
	preferences: preferencesRouter,
	goals: goalsRouter,
	autocomplete: autocompleteRouter,
	apikeys: apikeysRouter,
	feedback: feedbackRouter,
	flags: flagsRouter,
	targetGroups: targetGroupsRouter,
	organizations: organizationsRouter,
	billing: billingRouter,
	uptime: uptimeRouter,
	links: linksRouter,
	revenue: revenueRouter,
};

export type AppRouter = typeof appRouter;
