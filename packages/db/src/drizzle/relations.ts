import { relations } from "drizzle-orm/relations";
import {
	account,
	alarmDestinations,
	alarms,
	analyticsInsights,
	apikey,
	featureAccessLog,
	featureInvite,
	flags,
	flagsToTargetGroups,
	funnelDefinitions,
	invitation,
	links,
	member,
	organization,
	revenueConfig,
	session,
	statusPageMonitors,
	statusPageSections,
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
	({ one }) => ({
		website: one(websites, {
			fields: [uptimeSchedules.websiteId],
			references: [websites.id],
		}),
		organization: one(organization, {
			fields: [uptimeSchedules.organizationId],
			references: [organization.id],
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

export const statusPagesRelations = relations(statusPages, ({ one, many }) => ({
	organization: one(organization, {
		fields: [statusPages.organizationId],
		references: [organization.id],
	}),
	sections: many(statusPageSections),
	monitors: many(statusPageMonitors),
}));

export const statusPageSectionsRelations = relations(
	statusPageSections,
	({ one, many }) => ({
		statusPage: one(statusPages, {
			fields: [statusPageSections.statusPageId],
			references: [statusPages.id],
		}),
		monitors: many(statusPageMonitors),
	})
);

export const statusPageMonitorsRelations = relations(
	statusPageMonitors,
	({ one }) => ({
		statusPage: one(statusPages, {
			fields: [statusPageMonitors.statusPageId],
			references: [statusPages.id],
		}),
		section: one(statusPageSections, {
			fields: [statusPageMonitors.sectionId],
			references: [statusPageSections.id],
		}),
		schedule: one(uptimeSchedules, {
			fields: [statusPageMonitors.scheduleId],
			references: [uptimeSchedules.id],
		}),
	})
);

export const featureAccessLogRelations = relations(
	featureAccessLog,
	({ one }) => ({
		organization: one(organization, {
			fields: [featureAccessLog.organizationId],
			references: [organization.id],
		}),
	})
);
