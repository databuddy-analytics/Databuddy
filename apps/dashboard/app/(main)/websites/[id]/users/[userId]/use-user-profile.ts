import type { DateRange } from "@/types/analytics";
import type { DynamicQueryResponse } from "@/types/api";
import type { ProfileDetail, ProfileSession } from "@/types/sessions";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";

function fallbackSessionId(
	visitorId: string,
	session: ProfileSession,
	index: number
) {
	return [
		visitorId,
		session.first_visit || session.last_visit || "session",
		index,
	].join(":");
}

export function useUserProfile(
	websiteId: string,
	userId: string,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const sharedOptions = {
		...options,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
		enabled: Boolean(userId && websiteId),
	};

	const profileQuery = useDynamicQuery<{ profile_detail: ProfileDetail[] }>(
		websiteId,
		dateRange,
		{
			id: `user-profile-${userId}`,
			parameters: ["profile_detail"],
			filters: [
				{
					field: "anonymous_id",
					operator: "eq",
					value: userId,
				},
			],
		},
		sharedOptions
	);

	const sessionsQuery = useDynamicQuery<{ profile_sessions: ProfileSession[] }>(
		websiteId,
		dateRange,
		{
			id: `user-sessions-${userId}`,
			parameters: ["profile_sessions"],
			filters: [
				{
					field: "anonymous_id",
					operator: "eq",
					value: userId,
				},
			],
			limit: 100,
		},
		sharedOptions
	);

	const userProfile = useMemo(() => {
		const rawProfile = profileQuery.data.profile_detail?.[0];
		if (!rawProfile) {
			return null;
		}

		const rawSessions = sessionsQuery.data.profile_sessions || [];

		const sessions = Array.isArray(rawSessions)
			? rawSessions.map((session: ProfileSession, index) => ({
					session_id:
						session.session_id ||
						fallbackSessionId(rawProfile.visitor_id, session, index),
					session_name: session.session_name || "Session",
					first_visit: session.first_visit,
					last_visit: session.last_visit,
					duration: session.duration || 0,
					duration_formatted: session.duration_formatted || "0s",
					page_views: session.page_views || 0,
					unique_pages: session.unique_pages || 0,
					device: session.device || "",
					browser: session.browser || "",
					os: session.os || "",
					country: session.country || "",
					region: session.region || "",
					referrer: session.referrer || "direct",
					events: Array.isArray(session.events) ? session.events : [],
					web_vitals: Array.isArray(session.web_vitals)
						? session.web_vitals
						: [],
				}))
			: [];

		return {
			visitor_id: rawProfile.visitor_id,
			first_visit: rawProfile.first_visit,
			last_visit: rawProfile.last_visit,
			total_sessions: rawProfile.total_sessions,
			total_pageviews: rawProfile.total_pageviews,
			total_duration: rawProfile.total_duration,
			total_duration_formatted: rawProfile.total_duration_formatted,
			device: rawProfile.device || "",
			browser: rawProfile.browser || "",
			os: rawProfile.os || "",
			country: rawProfile.country || "",
			region: rawProfile.region || "",
			sessions,
		};
	}, [profileQuery.data, sessionsQuery.data]);

	return {
		userProfile,
		isLoading: profileQuery.isLoading || sessionsQuery.isLoading,
		isError: profileQuery.isError || sessionsQuery.isError,
		error: profileQuery.error || sessionsQuery.error,
	};
}
