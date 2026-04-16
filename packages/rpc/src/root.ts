import { agentChatsRouter } from "./routers/agent-chats";
import { alarmsRouter } from "./routers/alarms";
import { annotationsRouter } from "./routers/annotations";
import { anomaliesRouter } from "./routers/anomalies";
import { apikeysRouter } from "./routers/apikeys";
import { autocompleteRouter } from "./routers/autocomplete";
import { billingRouter } from "./routers/billing";
import { featureInviteRouter } from "./routers/feature-invite";
import { feedbackRouter } from "./routers/feedback";
import { flagsRouter } from "./routers/flags";
import { funnelsRouter } from "./routers/funnels";
import { goalsRouter } from "./routers/goals";
import { insightsRouter } from "./routers/insights";
import { linksRouter } from "./routers/links";
import { organizationsRouter } from "./routers/organizations";
import { preferencesRouter } from "./routers/preferences";
import { revenueRouter } from "./routers/revenue";
import { statusPageRouter } from "./routers/status-page";
import { targetGroupsRouter } from "./routers/target-groups";
import { uptimeRouter } from "./routers/uptime";
import { websitesRouter } from "./routers/websites";

export const appRouter = {
	agentChats: agentChatsRouter,
	alarms: alarmsRouter,
	anomalies: anomaliesRouter,
	annotations: annotationsRouter,
	websites: websitesRouter,
	funnels: funnelsRouter,
	preferences: preferencesRouter,
	goals: goalsRouter,
	autocomplete: autocompleteRouter,
	apikeys: apikeysRouter,
	featureInvite: featureInviteRouter,
	feedback: feedbackRouter,
	flags: flagsRouter,
	insights: insightsRouter,
	targetGroups: targetGroupsRouter,
	organizations: organizationsRouter,
	billing: billingRouter,
	statusPage: statusPageRouter,
	uptime: uptimeRouter,
	links: linksRouter,
	revenue: revenueRouter,
};

export type AppRouter = typeof appRouter;
