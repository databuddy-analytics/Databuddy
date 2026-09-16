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
	const save = useMutation({
		...orpc.businessContext.save.mutationOptions(),
		meta: mutationMeta,
	});
	const generate = useMutation({
		...orpc.businessContext.generate.mutationOptions(),
		meta: mutationMeta,
	});
	const cancel = useMutation({
		...orpc.businessContext.cancel.mutationOptions(),
		meta: mutationMeta,
	});
	const restore = useMutation({
		...orpc.businessContext.restore.mutationOptions(),
		meta: mutationMeta,
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
						const result = await cancel.mutateAsync({
							organizationId,
							generationId,
						});
						await queryClient.cancelQueries({
							queryKey: queryOptions.queryKey,
						});
						queryClient.setQueryData(queryOptions.queryKey, result);
					}}
					onRestore={async (restoreRevision, revision) => {
						try {
							const result = await restore.mutateAsync({
								organizationId,
								restoreRevision,
								revision,
							});
							await queryClient.cancelQueries({
								queryKey: queryOptions.queryKey,
							});
							queryClient.setQueryData(queryOptions.queryKey, result);
						} catch (error) {
							await queryClient.invalidateQueries({
								queryKey: queryOptions.queryKey,
							});
							throw error;
						}
					}}
					onGenerate={async (websiteId, sourceUrls) => {
						const result = await generate.mutateAsync({
							organizationId,
							websiteId,
							sourceUrls,
						});
						await queryClient.cancelQueries({
							queryKey: queryOptions.queryKey,
						});
						queryClient.setQueryData(queryOptions.queryKey, result);
					}}
					onSave={async (draft) => {
						try {
							const result = await save.mutateAsync({
								organizationId,
								...draft,
							});
							await queryClient.cancelQueries({
								queryKey: queryOptions.queryKey,
							});
							queryClient.setQueryData(queryOptions.queryKey, result);
						} catch (error) {
							await queryClient.invalidateQueries({
								queryKey: queryOptions.queryKey,
							});
							throw error;
						}
					}}
				/>
			)}
		</BusinessContextLayout>
	);
}
