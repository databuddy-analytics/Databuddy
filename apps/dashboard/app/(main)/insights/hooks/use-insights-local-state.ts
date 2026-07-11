"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
	const dismissedIdsRef = useRef<string[]>([]);
	dismissedIdsRef.current = dismissedIds;

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
		async (insightId: string) => {
			if (!organizationId) {
				return;
			}
			setDismissedIds((prev) => {
				const next = prev.filter((id) => id !== insightId);
				saveDismissedIds(organizationId, next);
				return next;
			});
			try {
				await setDismissedMutation.mutateAsync({ insightId, dismissed: false });
			} catch {
				setDismissedIds((prev) => {
					if (prev.includes(insightId)) {
						return prev;
					}
					const next = [...prev, insightId];
					saveDismissedIds(organizationId, next);
					return next;
				});
				toast.error("Could not restore finding");
			}
		},
		[organizationId, setDismissedMutation]
	);

	const dismissAction = useCallback(
		async (insightId: string) => {
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
				description: "This pattern is muted for 30 days.",
				action: {
					label: "Undo",
					onClick: () => restoreDismissedAction(insightId),
				},
			});
			try {
				await setDismissedMutation.mutateAsync({ insightId, dismissed: true });
			} catch {
				setDismissedIds((prev) => {
					const next = prev.filter((id) => id !== insightId);
					saveDismissedIds(organizationId, next);
					return next;
				});
				toast.error("Could not dismiss finding", { id: toastId });
			}
		},
		[organizationId, setDismissedMutation, restoreDismissedAction]
	);

	const clearAllDismissedAction = useCallback(async () => {
		if (!organizationId) {
			return;
		}
		const previous = dismissedIdsRef.current;
		setDismissedIds([]);
		saveDismissedIds(organizationId, []);
		try {
			await clearDismissedMutation.mutateAsync({});
		} catch {
			setDismissedIds(previous);
			saveDismissedIds(organizationId, previous);
			toast.error("Could not clear dismissed findings");
		}
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
