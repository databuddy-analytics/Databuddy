"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
	loadDismissedIds,
	saveDismissedIds,
} from "@/app/(main)/insights/lib/insights-local-storage";
import { orpc } from "@/lib/orpc";
import { toast } from "sonner";

export function useInsightsLocalState(
	organizationId: string | undefined,
	insightIds: string[]
) {
	const queryClient = useQueryClient();
	const [dismissedIds, setDismissedIds] = useState<string[]>([]);
	const [hydrated, setHydrated] = useState(false);

	const votesQuery = useQuery({
		...orpc.insights.getVotes.queryOptions({
			input: { insightIds },
		}),
		enabled: insightIds.length > 0,
	});

	const setVoteMutation = useMutation({
		...orpc.insights.setVote.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.insights.getVotes.key(),
			});
		},
	});

	useLayoutEffect(() => {
		if (!organizationId) {
			setDismissedIds([]);
			setHydrated(true);
			return;
		}
		setDismissedIds(loadDismissedIds(organizationId));
		setHydrated(true);
	}, [organizationId]);

	const restoreDismissedAction = useCallback(
		(insightId: string) => {
			if (!organizationId) {
				return;
			}
			setDismissedIds((prev) => {
				const next = prev.filter((id) => id !== insightId);
				saveDismissedIds(organizationId, next);
				return next;
			});
		},
		[organizationId]
	);

	const dismissAction = useCallback(
		(insightId: string) => {
			if (!organizationId) {
				return;
			}
			const toastId = `dismiss-${insightId}`;
			setDismissedIds((prev) => {
				if (prev.includes(insightId)) {
					return prev;
				}
				const next = [...prev, insightId];
				saveDismissedIds(organizationId, next);
				return next;
			});
			toast.success("Finding dismissed", {
				id: toastId,
				description: "Hidden from this view. You can restore it anytime.",
				action: {
					label: "Undo",
					onClick: () => restoreDismissedAction(insightId),
				},
			});
		},
		[organizationId, restoreDismissedAction]
	);

	const clearAllDismissedAction = useCallback(() => {
		if (!organizationId) {
			return;
		}
		setDismissedIds([]);
		saveDismissedIds(organizationId, []);
	}, [organizationId]);

	const setFeedbackAction = useCallback(
		(insightId: string, vote: "up" | "down" | null) => {
			if (!organizationId) {
				return;
			}
			setVoteMutation.mutate({ insightId, vote });
		},
		[organizationId, setVoteMutation]
	);

	const feedbackById = votesQuery.data?.votes ?? {};

	const dismissedIdSet = useMemo(() => new Set(dismissedIds), [dismissedIds]);

	return {
		hydrated,
		dismissedIdSet,
		dismissedIds,
		dismissAction,
		restoreDismissedAction,
		clearAllDismissedAction,
		feedbackById,
		setFeedbackAction,
	};
}
