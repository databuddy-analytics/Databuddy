import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { insightObservations } from "./insights";
import { websites } from "./websites";

export type InvestigationBillingMode = "fixed" | "legacy" | "unconfigured";
export type InvestigationChargeStatus =
	| "pending"
	| "reserved"
	| "confirm_pending"
	| "release_pending"
	| "confirmed"
	| "released"
	| "denied"
	| "review_required";

// One accepted operation owns one price and one provider lock across retries.
export const investigationCharges = pgTable(
	"investigation_charges",
	{
		id: text().primaryKey(),
		operationKey: text("operation_key").notNull(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		websiteId: text("website_id")
			.notNull()
			.references(() => websites.id, { onDelete: "cascade" }),
		runId: text("run_id"),
		observationId: text("observation_id").references(
			() => insightObservations.id,
			{ onDelete: "set null" }
		),
		customerId: text("customer_id"),
		mode: text().$type<InvestigationBillingMode>().notNull(),
		featureId: text("feature_id").notNull(),
		priceCents: integer("price_cents").notNull(),
		status: text().$type<InvestigationChargeStatus>().notNull(),
		expiresAt: timestamp("expires_at", {
			withTimezone: true,
			precision: 3,
		}).notNull(),
		leaseUntil: timestamp("lease_until", { withTimezone: true, precision: 3 }),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("investigation_charges_operation_uidx").on(
			table.organizationId,
			table.operationKey
		),
		uniqueIndex("investigation_charges_observation_uidx").on(
			table.observationId
		),
		index("investigation_charges_pending_idx").on(
			table.status,
			table.updatedAt
		),
		index("investigation_charges_run_idx").on(table.runId, table.websiteId),
	]
);
