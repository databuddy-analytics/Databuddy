import { chQuery } from "@databuddy/db";
import { referrers } from "@databuddy/shared/lists/referrers";

export interface SocialReferrerRow {
	avgDurationSeconds: number;
	bouncedSessions: number;
	host: string;
	pageviews: number;
	referrerUrl: string;
	sessions: number;
}

export interface SocialPlatformResult {
	avgDurationSeconds: number;
	bouncedSessions: number;
	host: string;
	name: string;
	sessions: number;
	urls: SocialReferrerRow[];
}

const SOCIAL_DOMAINS: string[] = Object.keys(referrers).filter(
	(d) => referrers[d].type === "social"
);

const HOST_TO_PLATFORM: Record<string, { host: string; name: string }> = {
	"t.co": { host: "twitter.com", name: "X / Twitter" },
	"twitter.com": { host: "twitter.com", name: "X / Twitter" },
	"x.com": { host: "twitter.com", name: "X / Twitter" },
	"mobile.twitter.com": { host: "twitter.com", name: "X / Twitter" },
	"l.facebook.com": { host: "facebook.com", name: "Facebook" },
	"lm.facebook.com": { host: "facebook.com", name: "Facebook" },
	"m.facebook.com": { host: "facebook.com", name: "Facebook" },
	"facebook.com": { host: "facebook.com", name: "Facebook" },
	"l.instagram.com": { host: "instagram.com", name: "Instagram" },
	"instagram.com": { host: "instagram.com", name: "Instagram" },
	"lnkd.in": { host: "linkedin.com", name: "LinkedIn" },
	"linkedin.com": { host: "linkedin.com", name: "LinkedIn" },
	"out.reddit.com": { host: "reddit.com", name: "Reddit" },
	"reddit.com": { host: "reddit.com", name: "Reddit" },
	"old.reddit.com": { host: "reddit.com", name: "Reddit" },
	"l.threads.net": { host: "threads.net", name: "Threads" },
	"threads.net": { host: "threads.net", name: "Threads" },
	"bsky.app": { host: "bsky.app", name: "Bluesky" },
	"youtube.com": { host: "youtube.com", name: "YouTube" },
	"m.youtube.com": { host: "youtube.com", name: "YouTube" },
	"tiktok.com": { host: "tiktok.com", name: "TikTok" },
	"pinterest.com": { host: "pinterest.com", name: "Pinterest" },
	"discord.com": { host: "discord.com", name: "Discord" },
};

function resolvePlatform(host: string): { host: string; name: string } {
	if (HOST_TO_PLATFORM[host]) {
		return HOST_TO_PLATFORM[host];
	}
	// Fallback: trim the subdomain to find a known parent in HOST_TO_PLATFORM
	const parts = host.split(".");
	for (let i = 1; i < parts.length - 1; i += 1) {
		const partial = parts.slice(i).join(".");
		if (HOST_TO_PLATFORM[partial]) {
			return HOST_TO_PLATFORM[partial];
		}
	}
	const fromList = referrers[host];
	return {
		host,
		name: fromList?.name ?? host,
	};
}

export function reshapeSocialReferrals(
	rows: SocialReferrerRow[],
	maxUrlsPerPlatform = 5
): SocialPlatformResult[] {
	const groups = new Map<
		string,
		{
			host: string;
			name: string;
			urls: SocialReferrerRow[];
			sessions: number;
			bouncedSessions: number;
			durationWeighted: number;
		}
	>();

	for (const row of rows) {
		const platform = resolvePlatform(row.host);
		const existing = groups.get(platform.host);
		if (existing) {
			existing.urls.push(row);
			existing.sessions += row.sessions;
			existing.bouncedSessions += row.bouncedSessions;
			existing.durationWeighted += row.avgDurationSeconds * row.sessions;
		} else {
			groups.set(platform.host, {
				host: platform.host,
				name: platform.name,
				urls: [row],
				sessions: row.sessions,
				bouncedSessions: row.bouncedSessions,
				durationWeighted: row.avgDurationSeconds * row.sessions,
			});
		}
	}

	const results: SocialPlatformResult[] = [];
	for (const g of groups.values()) {
		g.urls.sort((a, b) => {
			const aEngaged = a.sessions - a.bouncedSessions;
			const bEngaged = b.sessions - b.bouncedSessions;
			return bEngaged - aEngaged;
		});
		results.push({
			host: g.host,
			name: g.name,
			sessions: g.sessions,
			bouncedSessions: g.bouncedSessions,
			avgDurationSeconds: g.sessions > 0 ? g.durationWeighted / g.sessions : 0,
			urls: g.urls.slice(0, maxUrlsPerPlatform),
		});
	}

	results.sort(
		(a, b) => b.sessions - b.bouncedSessions - (a.sessions - a.bouncedSessions)
	);

	return results;
}

export async function fetchSocialReferrals(
	websiteIds: string[],
	rangeDays: number,
	limit = 200
): Promise<SocialReferrerRow[]> {
	if (websiteIds.length === 0 || SOCIAL_DOMAINS.length === 0) {
		return [];
	}

	const sql = `
WITH social_sessions AS (
  SELECT
    client_id,
    session_id,
    argMinIf(referrer, time, event_name = 'screen_view' AND referrer != '') AS entry_referrer,
    countIf(event_name = 'screen_view') AS page_count,
    sumIf(time_on_page, event_name = 'page_exit' AND time_on_page > 0) AS duration,
    countIf(event_name != 'screen_view' AND event_name != 'page_exit') AS engagement_count
  FROM analytics.events
  WHERE client_id IN {websiteIds:Array(String)}
    AND time >= today() - {rangeDays:UInt32} + 1
    AND time < today() + 1
    AND session_id != ''
  GROUP BY client_id, session_id
  HAVING entry_referrer != ''
    AND domain(entry_referrer) IN {socialDomains:Array(String)}
)
SELECT
  entry_referrer AS referrer_url,
  domain(entry_referrer) AS host,
  toInt64(count()) AS sessions,
  toInt64(countIf(page_count = 1 AND duration < 10 AND engagement_count = 0)) AS bounced_sessions,
  toFloat64(avg(duration)) AS avg_duration_seconds,
  toInt64(sum(page_count)) AS pageviews
FROM social_sessions
GROUP BY referrer_url, host
ORDER BY (sessions - bounced_sessions) DESC
LIMIT {limit:UInt32}
`;

	const rawRows = await chQuery<{
		referrer_url: unknown;
		host: unknown;
		sessions: unknown;
		bounced_sessions: unknown;
		avg_duration_seconds: unknown;
		pageviews: unknown;
	}>(sql, {
		websiteIds,
		rangeDays,
		socialDomains: SOCIAL_DOMAINS,
		limit,
	});

	return rawRows.map((r) => ({
		referrerUrl: String(r.referrer_url),
		host: String(r.host),
		sessions: Number(r.sessions ?? 0),
		bouncedSessions: Number(r.bounced_sessions ?? 0),
		avgDurationSeconds: Number(r.avg_duration_seconds ?? 0),
		pageviews: Number(r.pageviews ?? 0),
	}));
}
