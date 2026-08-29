export const EVENTS_VISITOR_KEY =
	"if(profile_id != '', profile_id, anonymous_id)";

export const CUSTOM_EVENTS_VISITOR_KEY =
	"coalesce(nullIf(profile_id, ''), nullIf(anonymous_id, ''))";

export function visitorMatch(param = "visitorId"): string {
	return `(anonymous_id = {${param}:String} OR profile_id = {${param}:String})`;
}

export const PROFILE_ID_TABLES = [
	"analytics.events",
	"analytics.custom_events",
	"analytics.revenue",
] as const;

export const IDENTITY_PAIR_TABLES = {
	anonymous_id: "analytics.identity_anon_pairs",
	session_id: "analytics.identity_session_pairs",
} as const;

export type IdentityPairKey = keyof typeof IDENTITY_PAIR_TABLES;

export function identityPairMapCte(keyColumn: IdentityPairKey): string {
	return `(
	SELECT ${keyColumn}, identity_time, profile_id
	FROM ${IDENTITY_PAIR_TABLES[keyColumn]}
	WHERE client_id = {websiteId:String}
		AND identity_time >= parseDateTimeBestEffort({startDate:String})
		AND identity_time <= parseDateTimeBestEffort({endDate:String})
)`;
}

export function sessionMetaCte(source: string): string {
	return `session_meta AS (
	SELECT
		session_id,
		argMinIf(profile_id, identity_time, profile_id != '') AS first_profile,
		argMaxIf(anonymous_id, identity_time, anonymous_id != '') AS mapped_anonymous_id
	FROM ${source}
	WHERE session_id != ''
	GROUP BY session_id
)`;
}

export function identityJoins(
	source: string,
	identityTime = `${source}.identity_time`
): string {
	return `
	ASOF LEFT JOIN identity_pairs_anon direct_profile
		ON ${source}.anonymous_id = direct_profile.anonymous_id
		AND direct_profile.identity_time <= ${identityTime}
	ASOF LEFT JOIN identity_pairs_session session_pairs
		ON ${source}.session_id = session_pairs.session_id
		AND session_pairs.identity_time <= ${identityTime}
	LEFT JOIN session_meta session_identity
		ON ${source}.session_id = session_identity.session_id
	ASOF LEFT JOIN identity_pairs_anon session_profile
		ON session_identity.mapped_anonymous_id = session_profile.anonymous_id
		AND session_profile.identity_time <= ${identityTime}`;
}

export function canonicalVisitorExpression(source: string): string {
	return `coalesce(
	nullIf(${source}.profile_id, ''),
	nullIf(session_pairs.profile_id, ''),
	nullIf(session_identity.first_profile, ''),
	nullIf(direct_profile.profile_id, ''),
	nullIf(session_profile.profile_id, ''),
	nullIf(${source}.anonymous_id, ''),
	nullIf(session_identity.mapped_anonymous_id, ''),
	''
)`;
}
