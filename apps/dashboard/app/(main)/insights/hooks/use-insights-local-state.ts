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

	const setDismissedMutation = useMutation(
		orpc.insights.setDismissed.mutationOptions()
	);

	const clearDismissedMutation = useMutation(
		orpc.insights.clearDismissed.mutationOptions()
	);

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
			setDismissedMutation.mutate({ insightId, dismissed: false });
		},
		[organizationId, setDismissedMutation]
	);

	const dismissAction = useCallback(
		(insightId: string) => {
			if (!organizationId) {
				return;
			}
			setDismissedIds((prev) => {
				if (prev.includes(insightId)) {
					return prev;
				}
				const next = [...prev, insightId];
				saveDismissedIds(organizationId, next);
				return next;
			});
			setDismissedMutation.mutate({ insightId, dismissed: true });
			toast.success("Insight dismissed", {
				description: "This pattern is muted for 30 days.",
				action: {
					label: "Undo",
					onClick: () => restoreDismissedAction(insightId),
				},
			});
		},
		[organizationId, setDismissedMutation, restoreDismissedAction]
	);

	const clearAllDismissedAction = useCallback(() => {
		if (!organizationId) {
			return;
		}
		setDismissedIds([]);
		saveDismissedIds(organizationId, []);
		clearDismissedMutation.mutate({});
	}, [organizationId, clearDismissedMutation]);

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
