"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { TrackingStatus } from "@/components/websites/connect-app";
import { orpc } from "@/lib/orpc";

const POLL_MS = 5000;

/**
 * Polls for the first page view and, once a setup prompt was copied, for the
 * coding agent's progress reports tied to this visit's session token.
 */
export function useAgentInstall(websiteId: string | null) {
	const [setupSession] = useState(() =>
		crypto.randomUUID().replaceAll("-", "").slice(0, 16)
	);
	const [copied, setCopied] = useState(false);

	const trackingQuery = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({
			input: { websiteId: websiteId ?? "" },
		}),
		enabled: websiteId !== null,
		refetchInterval: ({ state }) =>
			state.data?.tracking_setup ? false : POLL_MS,
		staleTime: 0,
	});
	const verified = trackingQuery.data?.tracking_setup ?? false;

	const progressQuery = useQuery({
		...orpc.websites.agentInstallProgress.queryOptions({
			input: { websiteId: websiteId ?? "", setupSession },
		}),
		enabled: websiteId !== null && copied && !verified,
		meta: { suppressGlobalErrorToast: true },
		refetchInterval: ({ state }) =>
			state.data?.status === "success" || state.data?.status === "failed"
				? false
				: POLL_MS,
		staleTime: 0,
	});

	const tracking: TrackingStatus = {
		state: verified ? "verified" : trackingQuery.isError ? "error" : "awaiting",
		issue: trackingQuery.data?.tracking_issue ?? null,
	};

	return {
		agentProgress: progressQuery.data ?? null,
		copied,
		markCopied: () => setCopied(true),
		recentEvents: trackingQuery.data?.recent_events ?? 0,
		setupSession,
		statusMessage: trackingQuery.data?.status_message ?? null,
		tracking,
		verified,
	};
}
