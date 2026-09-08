"use client";

import { businessContextIsGenerating } from "@databuddy/shared/organization-business-context";
import { Button, Card, Skeleton } from "@databuddy/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/top-bar";
import { orpc } from "@/lib/orpc";
import { BusinessContextEditor } from "./business-context-editor";

function BriefSkeleton() {
	return (
		<Card aria-label="Loading business context" role="status">
			<Card.Header>
				<Skeleton className="h-3.5 w-32" />
				<Skeleton className="h-3 w-3/4" />
			</Card.Header>
			<Card.Content className="space-y-5">
				<div className="flex items-center justify-between gap-3">
					<Skeleton className="h-3 w-28" />
					<Skeleton className="h-8 w-32" />
				</div>
				<Skeleton className="h-72 w-full" />
			</Card.Content>
		</Card>
	);
}

export function BusinessContextSkeleton() {
	return (
		<div className="mx-auto w-full max-w-2xl p-5">
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
	const queryOptions = orpc.businessContext.get.queryOptions({
		input: { organizationId },
	});
	const query = useQuery({
		...queryOptions,
		staleTime: 0,
		refetchOnWindowFocus: true,
		refetchInterval: ({ state }) =>
			state.data && businessContextIsGenerating(state.data) ? 2000 : false,
	});
	const save = useMutation(orpc.businessContext.save.mutationOptions());
	const generate = useMutation(orpc.businessContext.generate.mutationOptions());

	return (
		<div className="flex h-full min-h-0 flex-col">
			<TopBar.Breadcrumbs
				items={[
					{ label: "Settings", href: "/organizations/settings" },
					{ label: "Business Context" },
				]}
			/>
			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-5 p-5">
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
					{query.data && (
						<BusinessContextEditor
							settings={query.data}
							onGenerate={async (websiteId) => {
								const result = await generate.mutateAsync({
									organizationId,
									websiteId,
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
