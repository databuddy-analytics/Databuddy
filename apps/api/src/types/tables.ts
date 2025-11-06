import type {
	AnalyticsEvent,
	BlockedTraffic,
	ErrorEvent,
	StripeCharge,
	StripePaymentIntent,
	StripeRefund,
	WebVitalsEvent,
} from "@databuddy/db";

export const Analytics = {
	events: "analytics.events",
	errors: "analytics.errors",
	web_vitals: "analytics.web_vitals",
	stripe_payment_intents: "analytics.stripe_payment_intents",
	stripe_charges: "analytics.stripe_charges",
	stripe_refunds: "analytics.stripe_refunds",
	blocked_traffic: "analytics.blocked_traffic",
	outgoing_links: "analytics.outgoing_links",
	custom_events: "analytics.custom_events",
} as const;

export type AnalyticsTable = (typeof Analytics)[keyof typeof Analytics];

export type TableFieldsMap = {
	"analytics.events": keyof AnalyticsEvent;
	"analytics.errors": keyof ErrorEvent;
	"analytics.web_vitals": keyof WebVitalsEvent;
	"analytics.stripe_payment_intents": keyof StripePaymentIntent;
	"analytics.stripe_charges": keyof StripeCharge;
	"analytics.stripe_refunds": keyof StripeRefund;
	"analytics.blocked_traffic": keyof BlockedTraffic;
};
