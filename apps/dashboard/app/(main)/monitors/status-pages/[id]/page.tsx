"use client";

import { ArrowLeftIcon, ArrowSquareOutIcon, BrowserIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useCallback } from "react";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { ErrorBoundary } from "@/components/error-boundary";
import { EmptyState } from "@/components/empty-state";
import { FeatureAccessGate } from "@/components/feature-access-gate";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import { getStatusPageUrl } from "@/lib/app-url";
import { orpc } from "@/lib/orpc";
import { GeneralSettings } from "./_components/general-settings";
import { MonitorSettings } from "./_components/monitor-settings";

export default function StatusPageEditorPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const queryClient = useQueryClient();
	const pageQuery = useQuery({ ...orpc.statusPage.get.queryOptions({ input: { id } }) });
	const page = pageQuery.data;

	const invalidateAction = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.statusPage.get.key({ input: { id } }) });
		queryClient.invalidateQueries({ queryKey: orpc.statusPage.list.key({ input: {} }) });
	}, [queryClient, id]);

	return (
		<ErrorBoundary>
			<div className="flex h-full flex-col">
				<PageHeader
					description={page?.description ?? "Configure your status page"}
					icon={<BrowserIcon />}
					right={
						<>
							<Button asChild size="sm" variant="ghost">
								<Link href="/monitors/status-pages">
									<ArrowLeftIcon weight="fill" />
									Back
								</Link>
							</Button>
							{page ? (
								<Button asChild size="sm" variant="outline">
									<a href={getStatusPageUrl(page.slug)} rel="noopener noreferrer" target="_blank">
										<ArrowSquareOutIcon weight="duotone" />
										View
									</a>
								</Button>
							) : null}
						</>
					}
					title={page?.title ?? "Status Page"}
				/>

				<FeatureAccessGate flagKey="monitors" loadingFallback={<List.DefaultLoading />}>
					{pageQuery.isLoading ? (
						<List.DefaultLoading />
					) : page ? (
						<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none">
							<GeneralSettings invalidateAction={invalidateAction} page={page} />
							<MonitorSettings invalidateAction={invalidateAction} page={page} />
						</div>
					) : (
						<div className="flex flex-1 items-center justify-center py-16">
							<EmptyState
								description="The status page you are looking for does not exist."
								icon={<BrowserIcon />}
								title="Not found"
							/>
						</div>
					)}
				</FeatureAccessGate>
			</div>
		</ErrorBoundary>
	);
}
