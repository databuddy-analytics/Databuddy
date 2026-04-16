import { relations } from "drizzle-orm/relations";
import {
	account,
	agentChats,
	alarmDestinations,
	alarms,
	analyticsInsights,
	annotations,
	apikey,
	featureAccessLog,
	featureInvite,
	feedback,
	feedbackRedemptions,
	flags,
	flagsToTargetGroups,
	funnelDefinitions,
	goals,
	insightUserFeedback,
	invitation,
	links,
	member,
	organization,
	revenueConfig,
	session,
	ssoProvider,
	statusPageMonitors,
	statusPages,
	targetGroups,
	team,
	twoFactor,
	uptimeSchedules,
	usageAlertLog,
	user,
	userPreferences,
	websites,
} from "./schema";

export const userRelations = relations(user, ({ many }) => ({
	accounts: many(account),
	sessions: many(session),
	invitations: many(invitation),
	members: many(member),
	twoFactors: many(twoFactor),
	userPreferences: many(userPreferences),
	websites: many(websites),
	funnelDefinitions: many(funnelDefinitions),
	apikeys: many(apikey),
	usageAlertLogs: many(usageAlertLog),
}));

export const usageAlertLogRelations = relations(usageAlertLog, ({ one }) => ({
	user: one(user, {
		fields: [usageAlertLog.userId],
		references: [user.id],
	}),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	invitations: many(invitation),
	members: many(member),
	websites_organizationId: many(websites, {
		relationName: "websites_organizationId_organization_id",
	}),
	teams: many(team),
	alarms: many(alarms),
	analyticsInsights: many(analyticsInsights),
	statusPages: many(statusPages),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, {
		fields: [twoFactor.userId],
		references: [user.id],
	}),
}));

export const userPreferencesRelations = relations(
	userPreferences,
	({ one }) => ({
		user: one(user, {
			fields: [userPreferences.userId],
			references: [user.id],
		}),
	})
);

export const websitesRelations = relations(websites, ({ one, many }) => ({
	organization_organizationId: one(organization, {
		fields: [websites.organizationId],
		references: [organization.id],
		relationName: "websites_organizationId_organization_id",
	}),
	funnelDefinitions: many(funnelDefinitions),
	alarms: many(alarms),
	analyticsInsights: many(analyticsInsights),
}));

export const analyticsInsightsRelations = relations(
	analyticsInsights,
	({ one }) => ({
		organization: one(organization, {
			fields: [analyticsInsights.organizationId],
			references: [organization.id],
		}),
		website: one(websites, {
			fields: [analyticsInsights.websiteId],
			references: [websites.id],
		}),
	})
);

export const funnelDefinitionsRelations = relations(
	funnelDefinitions,
	({ one }) => ({
		website: one(websites, {
			fields: [funnelDefinitions.websiteId],
			references: [websites.id],
		}),
		user: one(user, {
			fields: [funnelDefinitions.createdBy],
			references: [user.id],
		}),
	})
);

export const teamRelations = relations(team, ({ one }) => ({
	organization: one(organization, {
		fields: [team.organizationId],
		references: [organization.id],
	}),
}));

export const apikeyRelations = relations(apikey, ({ one }) => ({
	user: one(user, {
		fields: [apikey.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [apikey.organizationId],
		references: [organization.id],
	}),
}));

export const flagsRelations = relations(flags, ({ one, many }) => ({
	website: one(websites, {
		fields: [flags.websiteId],
		references: [websites.id],
	}),
	flagsToTargetGroups: many(flagsToTargetGroups),
}));

export const targetGroupsRelations = relations(
	targetGroups,
	({ one, many }) => ({
		website: one(websites, {
			fields: [targetGroups.websiteId],
			references: [websites.id],
		}),
		flagsToTargetGroups: many(flagsToTargetGroups),
	})
);

export const flagsToTargetGroupsRelations = relations(
	flagsToTargetGroups,
	({ one }) => ({
		flag: one(flags, {
			fields: [flagsToTargetGroups.flagId],
			references: [flags.id],
		}),
		targetGroup: one(targetGroups, {
			fields: [flagsToTargetGroups.targetGroupId],
			references: [targetGroups.id],
		}),
	})
);

export const uptimeSchedulesRelations = relations(
	uptimeSchedules,
	({ one, many }) => ({
		website: one(websites, {
			fields: [uptimeSchedules.websiteId],
			references: [websites.id],
		}),
		organization: one(organization, {
			fields: [uptimeSchedules.organizationId],
			references: [organization.id],
		}),
		statusPageMonitors: many(statusPageMonitors),
	})
);

export const statusPagesRelations = relations(statusPages, ({ one, many }) => ({
	organization: one(organization, {
		fields: [statusPages.organizationId],
		references: [organization.id],
	}),
	statusPageMonitors: many(statusPageMonitors),
}));

export const statusPageMonitorsRelations = relations(
	statusPageMonitors,
	({ one }) => ({
		statusPage: one(statusPages, {
			fields: [statusPageMonitors.statusPageId],
			references: [statusPages.id],
		}),
		uptimeSchedule: one(uptimeSchedules, {
			fields: [statusPageMonitors.uptimeScheduleId],
			references: [uptimeSchedules.id],
		}),
	})
);

export const linksRelations = relations(links, ({ one }) => ({
	organization: one(organization, {
		fields: [links.organizationId],
		references: [organization.id],
	}),
	creator: one(user, {
		fields: [links.createdBy],
		references: [user.id],
	}),
}));

export const revenueConfigRelations = relations(revenueConfig, ({ one }) => ({
	website: one(websites, {
		fields: [revenueConfig.websiteId],
		references: [websites.id],
	}),
}));

export const alarmsRelations = relations(alarms, ({ one, many }) => ({
	organization: one(organization, {
		fields: [alarms.organizationId],
		references: [organization.id],
	}),
	website: one(websites, {
		fields: [alarms.websiteId],
		references: [websites.id],
	}),
	destinations: many(alarmDestinations),
}));

export const alarmDestinationsRelations = relations(
	alarmDestinations,
	({ one }) => ({
		alarm: one(alarms, {
			fields: [alarmDestinations.alarmId],
			references: [alarms.id],
		}),
	})
);

export const featureInviteRelations = relations(featureInvite, ({ one }) => ({
	inviter: one(user, {
		fields: [featureInvite.invitedById],
		references: [user.id],
		relationName: "inviter",
	}),
	redeemer: one(user, {
		fields: [featureInvite.redeemedById],
		references: [user.id],
		relationName: "redeemer",
	}),
}));

export const featureAccessLogRelations = relations(
	featureAccessLog,
	({ one }) => ({
		organization: one(organization, {
			fields: [featureAccessLog.organizationId],
			references: [organization.id],
		}),
	})
);

export const goalsRelations = relations(goals, ({ one }) => ({
	website: one(websites, {
		fields: [goals.websiteId],
		references: [websites.id],
	}),
	creator: one(user, {
		fields: [goals.createdBy],
		references: [user.id],
	}),
}));

export const annotationsRelations = relations(annotations, ({ one }) => ({
	website: one(websites, {
		fields: [annotations.websiteId],
		references: [websites.id],
	}),
	creator: one(user, {
		fields: [annotations.createdBy],
		references: [user.id],
	}),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
	user: one(user, {
		fields: [feedback.userId],
		references: [user.id],
		relationName: "feedbackUser",
	}),
	organization: one(organization, {
		fields: [feedback.organizationId],
		references: [organization.id],
	}),
	reviewer: one(user, {
		fields: [feedback.reviewedBy],
		references: [user.id],
		relationName: "feedbackReviewer",
	}),
}));

export const feedbackRedemptionsRelations = relations(
	feedbackRedemptions,
	({ one }) => ({
		user: one(user, {
			fields: [feedbackRedemptions.userId],
			references: [user.id],
		}),
		organization: one(organization, {
			fields: [feedbackRedemptions.organizationId],
			references: [organization.id],
		}),
	})
);

export const insightUserFeedbackRelations = relations(
	insightUserFeedback,
	({ one }) => ({
		user: one(user, {
			fields: [insightUserFeedback.userId],
			references: [user.id],
		}),
		organization: one(organization, {
			fields: [insightUserFeedback.organizationId],
			references: [organization.id],
		}),
	})
);

export const ssoProviderRelations = relations(ssoProvider, ({ one }) => ({
	user: one(user, {
		fields: [ssoProvider.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [ssoProvider.organizationId],
		references: [organization.id],
	}),
}));

export const agentChatsRelations = relations(agentChats, ({ one }) => ({
	user: one(user, {
		fields: [agentChats.userId],
		references: [user.id],
	}),
	website: one(websites, {
		fields: [agentChats.websiteId],
		references: [websites.id],
	}),
	organization: one(organization, {
		fields: [agentChats.organizationId],
		references: [organization.id],
	}),
}));
