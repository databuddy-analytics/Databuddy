"use client";

import { businessContextIsGenerating } from "@databuddy/shared/organization-business-context";
import { useSession } from "@databuddy/auth/client";
import { Button } from "@databuddy/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
	BusinessContextLayout,
	BusinessContextLoading,
} from "./business-context-layout";
import { orpc } from "@/lib/orpc";
import { BusinessContextEditor } from "./business-context-editor";

export function BusinessContextSettings({
	organizationId,
}: {
	organizationId: string;
}) {
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const queryOptions = orpc.businessContext.get.queryOptions({
		input: { organizationId },
	});
	const mutationMeta = { suppressGlobalErrorToast: true };
	const query = useQuery({
		...queryOptions,
		meta: mutationMeta,
		staleTime: 0,
		refetchOnWindowFocus: true,
		refetchInterval: ({ state }) =>
			state.data && businessContextIsGenerating(state.data) ? 2000 : false,
	});
	const access = useQuery({
		...orpc.businessContext.generationAccess.queryOptions({
			input: { organizationId },
		}),
		meta: mutationMeta,
		enabled: query.data?.canEdit === true,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		retry: false,
	});
	const generationStatus = query.data?.generation?.status;
	const canEdit = query.data?.canEdit;
	const refreshAccess = access.refetch;
	useEffect(() => {
		if (
			canEdit &&
			(generationStatus === "ready" || generationStatus === "failed")
		) {
			refreshAccess();
		}
	}, [canEdit, generationStatus, refreshAccess]);
	const mutationOptions = {
		meta: mutationMeta,
		onSuccess: async (
			result: Awaited<ReturnType<typeof orpc.businessContext.get.call>>,
			{ organizationId }: Parameters<typeof orpc.businessContext.get.call>[0]
		) => {
			const queryKey = orpc.businessContext.get.queryKey({
				input: { organizationId },
			});
			await queryClient.cancelQueries({ queryKey });
			queryClient.setQueryData(queryKey, result);
		},
	};
	const editMutationOptions = {
		...mutationOptions,
		onError: (
			_error: unknown,
			{ organizationId }: Parameters<typeof orpc.businessContext.get.call>[0]
		) =>
			queryClient.invalidateQueries({
				queryKey: orpc.businessContext.get.queryKey({
					input: { organizationId },
				}),
			}),
	};
	const save = useMutation({
		...orpc.businessContext.save.mutationOptions(),
		...editMutationOptions,
	});
	const generate = useMutation({
		...orpc.businessContext.generate.mutationOptions(),
		...mutationOptions,
	});
	const cancel = useMutation({
		...orpc.businessContext.cancel.mutationOptions(),
		...mutationOptions,
	});
	const restore = useMutation({
		...orpc.businessContext.restore.mutationOptions(),
		...editMutationOptions,
	});

	return (
		<BusinessContextLayout>
			{(query.isPending || (query.data && !session?.user)) && (
				<BusinessContextLoading />
			)}
			{query.isError && (
				<div
					className="flex flex-wrap items-center justify-between gap-3"
					role="alert"
				>
					<p className="text-muted-foreground text-sm">
						{query.data
							? "Couldn't refresh the brief. Your edits are still here."
							: "Couldn't load the business brief."}
					</p>
					<Button
						disabled={query.isFetching}
						onClick={() => query.refetch()}
						size="sm"
						variant="secondary"
					>
						Try again
					</Button>
				</div>
			)}
			{query.data && session?.user && (
				<BusinessContextEditor
					key={`${session.user.id}:${organizationId}`}
					storageKey={`business-context-draft:${session.user.id}:${organizationId}`}
					settings={query.data}
					access={
						access.isError
							? {
									status: "unavailable",
									action: "retry",
									message:
										"Generation access could not be checked. Try again shortly; your brief is still editable.",
								}
							: access.data
					}
					accessPending={
						access.isFetching || (query.data.canEdit && access.isPending)
					}
					onRefreshAccess={() => access.refetch()}
					onCancel={async (generationId) => {
						await cancel.mutateAsync({
							organizationId,
							generationId,
						});
					}}
					onRestore={async (restoreRevision, revision) => {
						await restore.mutateAsync({
							organizationId,
							restoreRevision,
							revision,
						});
					}}
					onGenerate={async (websiteId, sourceUrls) => {
						await generate.mutateAsync({
							organizationId,
							websiteId,
							sourceUrls,
						});
					}}
					onSave={async (draft) => {
						await save.mutateAsync({ organizationId, ...draft });
					}}
				/>
			)}
		</BusinessContextLayout>
	);
}
