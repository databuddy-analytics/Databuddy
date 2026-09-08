"use client";

import { businessContextIsGenerating } from "@databuddy/shared/organization-business-context";
import { Button, Skeleton } from "@databuddy/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/top-bar";
import { orpc } from "@/lib/orpc";
import { BusinessContextEditor } from "./business-context-editor";

export function BusinessContextSkeleton() {
	return (
		<div
			aria-label="Loading business context"
			className="mx-auto max-w-3xl space-y-5 p-5"
			role="status"
		>
			<Skeleton className="h-5 w-36" />
			<Skeleton className="h-4 w-3/4" />
			<Skeleton className="h-96 w-full" />
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
		<>
			<TopBar.Breadcrumbs
				items={[
					{ label: "Settings", href: "/organizations/settings" },
					{ label: "Business Context" },
				]}
			/>
			{query.isPending && <BusinessContextSkeleton />}
			{query.isError && (
				<div
					className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4"
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
		</>
	);
}
