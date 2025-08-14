import { relations } from 'drizzle-orm/relations';
import {
	abExperiments,
	abGoals,
	abVariants,
	account,
	apikey,
	apikeyAccess,
	funnelDefinitions,
	funnelGoals,
	invitation,
	member,
	organization,
	session,
	team,
	twoFactor,
	user,
	userPreferences,
	websites,
} from './schema';

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
	abExperiments: many(abExperiments),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	invitations: many(invitation),
	members: many(member),
	websites_organizationId: many(websites, {
		relationName: 'websites_organizationId_organization_id',
	}),
	teams: many(team),
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
	user: one(user, {
		fields: [websites.userId],
		references: [user.id],
	}),
	organization_organizationId: one(organization, {
		fields: [websites.organizationId],
		references: [organization.id],
		relationName: 'websites_organizationId_organization_id',
	}),
	funnelDefinitions: many(funnelDefinitions),
	abExperiments: many(abExperiments),
}));

export const funnelGoalsRelations = relations(funnelGoals, ({ one }) => ({
	funnelDefinition: one(funnelDefinitions, {
		fields: [funnelGoals.funnelId],
		references: [funnelDefinitions.id],
	}),
}));

export const funnelDefinitionsRelations = relations(
	funnelDefinitions,
	({ one, many }) => ({
		funnelGoals: many(funnelGoals),
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

export const apikeyRelations = relations(apikey, ({ one, many }) => ({
	user: one(user, {
		fields: [apikey.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [apikey.organizationId],
		references: [organization.id],
	}),
	access: many(apikeyAccess),
}));

export const apikeyAccessRelations = relations(apikeyAccess, ({ one }) => ({
	apikey: one(apikey, {
		fields: [apikeyAccess.apikeyId],
		references: [apikey.id],
	}),
}));

export const abExperimentsRelations = relations(
	abExperiments,
	({ one, many }) => ({
		website: one(websites, {
			fields: [abExperiments.websiteId],
			references: [websites.id],
		}),
		user: one(user, {
			fields: [abExperiments.createdBy],
			references: [user.id],
		}),
		variants: many(abVariants),
		goals: many(abGoals),
	})
);

export const abVariantsRelations = relations(abVariants, ({ one }) => ({
	experiment: one(abExperiments, {
		fields: [abVariants.experimentId],
		references: [abExperiments.id],
	}),
}));

export const abGoalsRelations = relations(abGoals, ({ one }) => ({
	experiment: one(abExperiments, {
		fields: [abGoals.experimentId],
		references: [abExperiments.id],
	}),
}));
