import { defineRelations } from "drizzle-orm";
import { agentChats } from "./agent";
import {
	analyticsInsights,
	annotations,
	funnelDefinitions,
	goals,
	revenueConfig,
} from "./analytics";
import { apikey } from "./api-keys";
import {
	account,
	invitation,
	member,
	organization,
	session,
	ssoProvider,
	team,
	twoFactor,
	user,
	userPreferences,
} from "./auth";
import { alarmDestinations, alarms, usageAlertLog } from "./billing";
import { feedback, feedbackRedemptions, insightUserFeedback } from "./feedback";
import { flags, flagsToTargetGroups, targetGroups } from "./flags";
import { slackChannelBindings, slackIntegrations } from "./integrations";
import {
	insightGenerationConfigs,
	insightRunItems,
	insightRollups,
	insightRuns,
} from "./insights";
import { linkFolders, links } from "./links";
import {
	incidentAffectedMonitors,
	incidentUpdates,
	incidents,
	statusPageMonitors,
	statusPages,
	uptimeSchedules,
} from "./uptime";
import { websites } from "./websites";

const schema = {
	user,
	account,
	session,
	invitation,
	member,
	organization,
	twoFactor,
	userPreferences,
	team,
	websites,
	analyticsInsights,
	funnelDefinitions,
	apikey,
	flags,
	targetGroups,
	flagsToTargetGroups,
	uptimeSchedules,
	statusPages,
	statusPageMonitors,
	incidents,
	incidentUpdates,
	incidentAffectedMonitors,
	links,
	linkFolders,
	revenueConfig,
	alarms,
	alarmDestinations,
	usageAlertLog,
	goals,
	annotations,
	feedback,
	feedbackRedemptions,
	insightUserFeedback,
	insightGenerationConfigs,
	insightRuns,
	insightRunItems,
	insightRollups,
	ssoProvider,
	agentChats,
	slackIntegrations,
	slackChannelBindings,
};

export const relations = defineRelations(schema, (r) => ({
	user: {
		accounts: r.many.account(),
		sessions: r.many.session(),
		invitations: r.many.invitation({
			from: r.user.id,
			to: r.invitation.inviterId,
		}),
		members: r.many.member(),
		twoFactors: r.many.twoFactor(),
		userPreferences: r.many.userPreferences(),
		apikeys: r.many.apikey(),
		usageAlertLogs: r.many.usageAlertLog(),
	},

	usageAlertLog: {
		user: r.one.user({
			from: r.usageAlertLog.userId,
			to: r.user.id,
			optional: false,
		}),
	},

	organization: {
		invitations: r.many.invitation(),
		members: r.many.member(),
		websites_organizationId: r.many.websites({
			alias: "websites_organizationId_organization_id",
		}),
		teams: r.many.team(),
		alarms: r.many.alarms(),
		analyticsInsights: r.many.analyticsInsights(),
		statusPages: r.many.statusPages(),
		linkFolders: r.many.linkFolders(),
		links: r.many.links(),
		slackIntegrations: r.many.slackIntegrations(),
		insightGenerationConfigs: r.many.insightGenerationConfigs(),
		insightRuns: r.many.insightRuns(),
		insightRollups: r.many.insightRollups(),
	},

	account: {
		user: r.one.user({
			from: r.account.userId,
			to: r.user.id,
			optional: false,
		}),
	},

	session: {
		user: r.one.user({
			from: r.session.userId,
			to: r.user.id,
		}),
	},

	invitation: {
		organization: r.one.organization({
			from: r.invitation.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		user: r.one.user({
			from: r.invitation.inviterId,
			to: r.user.id,
			optional: false,
		}),
	},

	member: {
		organization: r.one.organization({
			from: r.member.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		user: r.one.user({
			from: r.member.userId,
			to: r.user.id,
			optional: false,
		}),
	},

	twoFactor: {
		user: r.one.user({
			from: r.twoFactor.userId,
			to: r.user.id,
			optional: false,
		}),
	},

	userPreferences: {
		user: r.one.user({
			from: r.userPreferences.userId,
			to: r.user.id,
			optional: false,
		}),
	},

	websites: {
		organization_organizationId: r.one.organization({
			from: r.websites.organizationId,
			to: r.organization.id,
			alias: "websites_organizationId_organization_id",
			optional: false,
		}),
		funnelDefinitions: r.many.funnelDefinitions(),
		alarms: r.many.alarms(),
		analyticsInsights: r.many.analyticsInsights(),
		insightGenerationConfigs: r.many.insightGenerationConfigs(),
		insightRunItems: r.many.insightRunItems(),
	},

	analyticsInsights: {
		organization: r.one.organization({
			from: r.analyticsInsights.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		website: r.one.websites({
			from: r.analyticsInsights.websiteId,
			to: r.websites.id,
			optional: false,
		}),
	},

	insightGenerationConfigs: {
		organization: r.one.organization({
			from: r.insightGenerationConfigs.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		website: r.one.websites({
			from: r.insightGenerationConfigs.websiteId,
			to: r.websites.id,
		}),
	},

	insightRuns: {
		organization: r.one.organization({
			from: r.insightRuns.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		requestedByUser: r.one.user({
			from: r.insightRuns.requestedByUserId,
			to: r.user.id,
		}),
		items: r.many.insightRunItems(),
		rollups: r.many.insightRollups(),
	},

	insightRunItems: {
		run: r.one.insightRuns({
			from: r.insightRunItems.runId,
			to: r.insightRuns.id,
			optional: false,
		}),
		organization: r.one.organization({
			from: r.insightRunItems.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		website: r.one.websites({
			from: r.insightRunItems.websiteId,
			to: r.websites.id,
			optional: false,
		}),
	},

	insightRollups: {
		organization: r.one.organization({
			from: r.insightRollups.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		run: r.one.insightRuns({
			from: r.insightRollups.runId,
			to: r.insightRuns.id,
		}),
	},

	funnelDefinitions: {
		website: r.one.websites({
			from: r.funnelDefinitions.websiteId,
			to: r.websites.id,
			optional: false,
		}),
		user: r.one.user({
			from: r.funnelDefinitions.createdBy,
			to: r.user.id,
			optional: false,
		}),
	},

	team: {
		organization: r.one.organization({
			from: r.team.organizationId,
			to: r.organization.id,
			optional: false,
		}),
	},

	apikey: {
		user: r.one.user({
			from: r.apikey.userId,
			to: r.user.id,
		}),
		organization: r.one.organization({
			from: r.apikey.organizationId,
			to: r.organization.id,
		}),
	},

	slackIntegrations: {
		organization: r.one.organization({
			from: r.slackIntegrations.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		installedByUser: r.one.user({
			from: r.slackIntegrations.installedByUserId,
			to: r.user.id,
		}),
		channelBindings: r.many.slackChannelBindings(),
	},

	slackChannelBindings: {
		integration: r.one.slackIntegrations({
			from: r.slackChannelBindings.integrationId,
			to: r.slackIntegrations.id,
			optional: false,
		}),
	},

	flags: {
		website: r.one.websites({
			from: r.flags.websiteId,
			to: r.websites.id,
		}),
		flagsToTargetGroups: r.many.flagsToTargetGroups(),
	},

	targetGroups: {
		website: r.one.websites({
			from: r.targetGroups.websiteId,
			to: r.websites.id,
			optional: false,
		}),
		flagsToTargetGroups: r.many.flagsToTargetGroups(),
	},

	flagsToTargetGroups: {
		flag: r.one.flags({
			from: r.flagsToTargetGroups.flagId,
			to: r.flags.id,
			optional: false,
		}),
		targetGroup: r.one.targetGroups({
			from: r.flagsToTargetGroups.targetGroupId,
			to: r.targetGroups.id,
			optional: false,
		}),
	},

	uptimeSchedules: {
		website: r.one.websites({
			from: r.uptimeSchedules.websiteId,
			to: r.websites.id,
			optional: false,
		}),
		organization: r.one.organization({
			from: r.uptimeSchedules.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		statusPageMonitors: r.many.statusPageMonitors(),
	},

	statusPages: {
		organization: r.one.organization({
			from: r.statusPages.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		statusPageMonitors: r.many.statusPageMonitors(),
		incidents: r.many.incidents(),
	},

	incidents: {
		statusPage: r.one.statusPages({
			from: r.incidents.statusPageId,
			to: r.statusPages.id,
			optional: false,
		}),
		updates: r.many.incidentUpdates(),
		affectedMonitors: r.many.incidentAffectedMonitors(),
	},

	incidentAffectedMonitors: {
		incident: r.one.incidents({
			from: r.incidentAffectedMonitors.incidentId,
			to: r.incidents.id,
			optional: false,
		}),
		statusPageMonitor: r.one.statusPageMonitors({
			from: r.incidentAffectedMonitors.statusPageMonitorId,
			to: r.statusPageMonitors.id,
			optional: false,
		}),
	},

	incidentUpdates: {
		incident: r.one.incidents({
			from: r.incidentUpdates.incidentId,
			to: r.incidents.id,
			optional: false,
		}),
	},

	statusPageMonitors: {
		statusPage: r.one.statusPages({
			from: r.statusPageMonitors.statusPageId,
			to: r.statusPages.id,
			optional: false,
		}),
		uptimeSchedule: r.one.uptimeSchedules({
			from: r.statusPageMonitors.uptimeScheduleId,
			to: r.uptimeSchedules.id,
			optional: false,
		}),
		incidentAffectedMonitors: r.many.incidentAffectedMonitors(),
	},

	links: {
		organization: r.one.organization({
			from: r.links.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		creator: r.one.user({
			from: r.links.createdBy,
			to: r.user.id,
			optional: false,
		}),
		folder: r.one.linkFolders({
			from: r.links.folderId,
			to: r.linkFolders.id,
		}),
	},

	linkFolders: {
		organization: r.one.organization({
			from: r.linkFolders.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		creator: r.one.user({
			from: r.linkFolders.createdBy,
			to: r.user.id,
			optional: false,
		}),
		links: r.many.links(),
	},

	revenueConfig: {
		website: r.one.websites({
			from: r.revenueConfig.websiteId,
			to: r.websites.id,
		}),
	},

	alarms: {
		organization: r.one.organization({
			from: r.alarms.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		website: r.one.websites({
			from: r.alarms.websiteId,
			to: r.websites.id,
		}),
		destinations: r.many.alarmDestinations(),
	},

	alarmDestinations: {
		alarm: r.one.alarms({
			from: r.alarmDestinations.alarmId,
			to: r.alarms.id,
			optional: false,
		}),
	},

	goals: {
		website: r.one.websites({
			from: r.goals.websiteId,
			to: r.websites.id,
			optional: false,
		}),
		creator: r.one.user({
			from: r.goals.createdBy,
			to: r.user.id,
			optional: false,
		}),
	},

	annotations: {
		website: r.one.websites({
			from: r.annotations.websiteId,
			to: r.websites.id,
			optional: false,
		}),
		creator: r.one.user({
			from: r.annotations.createdBy,
			to: r.user.id,
			optional: false,
		}),
	},

	feedback: {
		user: r.one.user({
			from: r.feedback.userId,
			to: r.user.id,
			alias: "feedbackUser",
			optional: false,
		}),
		organization: r.one.organization({
			from: r.feedback.organizationId,
			to: r.organization.id,
			optional: false,
		}),
		reviewer: r.one.user({
			from: r.feedback.reviewedBy,
			to: r.user.id,
			alias: "feedbackReviewer",
		}),
	},

	feedbackRedemptions: {
		user: r.one.user({
			from: r.feedbackRedemptions.userId,
			to: r.user.id,
			optional: false,
		}),
		organization: r.one.organization({
			from: r.feedbackRedemptions.organizationId,
			to: r.organization.id,
			optional: false,
		}),
	},

	insightUserFeedback: {
		user: r.one.user({
			from: r.insightUserFeedback.userId,
			to: r.user.id,
			optional: false,
		}),
		organization: r.one.organization({
			from: r.insightUserFeedback.organizationId,
			to: r.organization.id,
			optional: false,
		}),
	},

	ssoProvider: {
		user: r.one.user({
			from: r.ssoProvider.userId,
			to: r.user.id,
		}),
		organization: r.one.organization({
			from: r.ssoProvider.organizationId,
			to: r.organization.id,
		}),
	},

	agentChats: {
		user: r.one.user({
			from: r.agentChats.userId,
			to: r.user.id,
			optional: false,
		}),
		website: r.one.websites({
			from: r.agentChats.websiteId,
			to: r.websites.id,
			optional: false,
		}),
		organization: r.one.organization({
			from: r.agentChats.organizationId,
			to: r.organization.id,
		}),
	},
}));
