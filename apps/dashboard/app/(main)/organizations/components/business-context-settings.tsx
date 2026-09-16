"use client";

import { businessContextIsGenerating } from "@databuddy/shared/organization-business-context";
import { useSession } from "@databuddy/auth/client";
import { Button, Card, Skeleton } from "@databuddy/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { orpc } from "@/lib/orpc";
import { BusinessContextEditor } from "./business-context-editor";

function BriefSkeleton() {
	return (
		<div
			className="space-y-6"
			aria-label="Loading business context"
			role="status"
		>
			<div className="space-y-2">
				<Skeleton className="h-7 w-48" />
				<Skeleton className="h-6 w-full max-w-xl" />
			</div>
			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
				<Card>
					<Card.Header className="h-20">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-3/4" />
					</Card.Header>
					<div className="flex h-12 items-center border-border border-b px-5">
						<Skeleton className="h-7 w-40" />
					</div>
					<div className="h-112 space-y-5 p-6">
						<Skeleton className="h-5 w-1/2" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6" />
						<Skeleton className="h-4 w-3/4" />
					</div>
					<div className="flex h-16 items-center border-border border-t px-5">
						<Skeleton className="h-3 w-32" />
					</div>
				</Card>
				<Card className="hidden xl:flex">
					<Card.Header>
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-8 w-full" />
					</Card.Header>
					<Card.Content className="space-y-4">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-28 w-full" />
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-8 w-full" />
					</Card.Content>
				</Card>
			</div>
		</div>
	);
}

export function BusinessContextSkeleton() {
	return (
		<div className="mx-auto w-full max-w-6xl p-5">
			<BriefSkeleton />
		</div>
	);
}

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
		<div className="flex h-full min-h-0 flex-col">
			<TopBar.Breadcrumbs
				items={[
					{ label: "Settings", href: "/organizations/settings" },
					{ label: "Business Context" },
				]}
			/>
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-6xl space-y-5 p-5">
					{query.isPending && <BriefSkeleton />}
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
				</div>
			</div>
		</div>
	);
}
