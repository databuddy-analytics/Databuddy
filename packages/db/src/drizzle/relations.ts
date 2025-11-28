import { relations } from "drizzle-orm/relations";
import {
	account,
	apikey,
	funnelDefinitions,
	invitation,
	member,
	organization,
	session,
	team,
	twoFactor,
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
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	invitations: many(invitation),
	members: many(member),
	websites_organizationId: many(websites, {
		relationName: "websites_organizationId_organization_id",
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
		relationName: "websites_organizationId_organization_id",
	}),
	funnelDefinitions: many(funnelDefinitions),
}));

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
