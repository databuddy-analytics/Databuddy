export const EVENTS_VISITOR_KEY =
	"if(profile_id != '', profile_id, anonymous_id)";

export const CUSTOM_EVENTS_VISITOR_KEY =
	"if(profile_id != '', profile_id, ifNull(anonymous_id, ''))";

export function visitorMatch(param = "visitorId"): string {
	return `(anonymous_id = {${param}:String} OR profile_id = {${param}:String})`;
}

export const PROFILE_ID_TABLES = [
	"analytics.events",
	"analytics.custom_events",
	"analytics.revenue",
] as const;
