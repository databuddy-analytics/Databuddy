import {
	foreignKey,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const feedbackCategory = pgEnum("feedback_category", [
	"bug_report",
	"feature_request",
	"ux_improvement",
	"performance",
	"documentation",
	"other",
]);

export const feedbackStatus = pgEnum("feedback_status", [
	"pending",
	"approved",
	"rejected",
]);

export const insightFeedbackVoteEnum = pgEnum("insight_feedback_vote", [
	"up",
	"down",
	"dismissed",
]);

export const feedback = pgTable(
	"feedback",
	{
		id: text().primaryKey(),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id").notNull(),
		title: text().notNull(),
		description: text().notNull(),
		category: feedbackCategory().notNull(),
		status: feedbackStatus().default("pending").notNull(),
		creditsAwarded: integer("credits_awarded").default(0).notNull(),
		adminNotes: text("admin_notes"),
		reviewedBy: text("reviewed_by"),
		reviewedAt: timestamp("reviewed_at", {
			precision: 3,
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("feedback_user_id_idx").on(table.userId),
		index("feedback_org_status_idx").on(table.organizationId, table.status),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "feedback_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "feedback_organization_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [user.id],
			name: "feedback_reviewed_by_fkey",
		}).onDelete("set null"),
	]
);

export const feedbackRedemptions = pgTable(
	"feedback_redemptions",
	{
		id: text().primaryKey(),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id").notNull(),
		creditsSpent: integer("credits_spent").notNull(),
		rewardType: text("reward_type").notNull(),
		rewardAmount: integer("reward_amount").notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("feedback_redemptions_user_id_idx").on(table.userId),
		index("feedback_redemptions_organization_id_idx").on(table.organizationId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "feedback_redemptions_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "feedback_redemptions_organization_id_fkey",
		}).onDelete("cascade"),
	]
);

export const insightUserFeedback = pgTable(
	"insight_user_feedback",
	{
		id: text().primaryKey(),
		userId: text("user_id").notNull(),
		organizationId: text("organization_id").notNull(),
		insightId: text("insight_id").notNull(),
		vote: insightFeedbackVoteEnum().notNull(),
		createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("insight_user_feedback_user_org_insight_uidx").on(
			table.userId,
			table.organizationId,
			table.insightId
		),
		index("insight_user_feedback_organization_id_idx").on(table.organizationId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "insight_user_feedback_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "insight_user_feedback_organization_id_fkey",
		}).onDelete("cascade"),
	]
);

export type Feedback = typeof feedback.$inferSelect;
export type FeedbackInsert = typeof feedback.$inferInsert;
export type FeedbackRedemption = typeof feedbackRedemptions.$inferSelect;
export type FeedbackRedemptionInsert = typeof feedbackRedemptions.$inferInsert;
