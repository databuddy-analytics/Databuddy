"use client";

import { businessContextIsGenerating } from "@databuddy/shared/organization-business-context";
import { useSession } from "@databuddy/auth/client";
import { Button } from "@databuddy/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
	const stream = useRef<{
		organizationId: string;
		controller: AbortController;
	} | null>(null);
	const [streamingOrganizationId, setStreamingOrganizationId] =
		useState<string>();
	const streaming = streamingOrganizationId === organizationId;

	function stopStream() {
		const current = stream.current;
		stream.current = null;
		current?.controller.abort();
		setStreamingOrganizationId(undefined);
	}

	useEffect(
		() => () => {
			if (stream.current?.organizationId === organizationId) {
				stream.current.controller.abort();
				stream.current = null;
				setStreamingOrganizationId(undefined);
			}
		},
		[organizationId]
	);
	const query = useQuery({
		...queryOptions,
		meta: mutationMeta,
		staleTime: 0,
		refetchOnWindowFocus: !streaming,
		refetchInterval: ({ state }) =>
			!streaming && state.data && businessContextIsGenerating(state.data)
				? 2000
				: false,
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
			_error: Error,
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
	const cancel = useMutation({
		...orpc.businessContext.cancel.mutationOptions(),
		...mutationOptions,
	});
	const restore = useMutation({
		...orpc.businessContext.restore.mutationOptions(),
		...editMutationOptions,
	});

	async function generate(websiteId: string, sourceUrls: string[]) {
		if (stream.current) {
			return;
		}
		const attempt = { organizationId, controller: new AbortController() };
		stream.current = attempt;
		setStreamingOrganizationId(organizationId);
		let completed = false;
		try {
			await queryClient.cancelQueries({ queryKey: queryOptions.queryKey });
			const events = await orpc.businessContext.generate.call(
				{ organizationId, websiteId, sourceUrls },
				{ signal: attempt.controller.signal }
			);
			for await (const result of events) {
				if (stream.current !== attempt || attempt.controller.signal.aborted) {
					break;
				}
				queryClient.setQueryData(queryOptions.queryKey, (current) => {
					// A teammate may have saved while this request was researching.
					return current &&
						(current.profile?.revision ?? 0) > (result.profile?.revision ?? 0)
						? { ...result, profile: current.profile, history: current.history }
						: result;
				});
				completed =
					result.generation?.status === "ready" ||
					result.generation?.status === "failed";
			}
			if (!(completed || attempt.controller.signal.aborted)) {
				throw new Error(
					"Research was interrupted before the draft was complete. Your edits are still here. Try again."
				);
			}
		} catch (error) {
			if (!attempt.controller.signal.aborted) {
				throw error;
			}
		} finally {
			if (stream.current === attempt) {
				stream.current = null;
				setStreamingOrganizationId(undefined);
				await queryClient.invalidateQueries({
					queryKey: queryOptions.queryKey,
				});
			}
		}
	}

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
						stopStream();
						if (!generationId) {
							await queryClient.invalidateQueries({
								queryKey: queryOptions.queryKey,
							});
							return;
						}
						await cancel.mutateAsync({
							organizationId,
							generationId,
						});
					}}
					onRestore={async (restoreRevision, revision) => {
						stopStream();
						await restore.mutateAsync({
							organizationId,
							restoreRevision,
							revision,
						});
					}}
					onGenerate={generate}
					onSave={async (draft) => {
						stopStream();
						await save.mutateAsync({ organizationId, ...draft });
					}}
				/>
			)}
		</BusinessContextLayout>
	);
}
