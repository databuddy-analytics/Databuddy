"use client";

import {
	ArrowSquareOutIcon,
	BrowserIcon,
	DotsThreeIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeatureAccessGate } from "@/components/feature-access-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/composables/list";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { getStatusPageUrl } from "@/lib/app-url";
import type { ListQuerySlice } from "@/lib/list-query-outcome";
import { orpc } from "@/lib/orpc";
import { CreateStatusPageSheet } from "./_components/create-status-page-sheet";

interface StatusPageItem {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	isPublished: boolean;
	theme: string;
	accentColor: string | null;
	createdAt: Date | string;
	updatedAt: Date | string;
}

export default function StatusPagesPage() {
	const { hasAccess, isLoading: isAccessLoading } =
		useFeatureAccess("monitors");
	const [isCreateOpen, setIsCreateOpen] = useState(false);

	const pagesQuery = useQuery({
		...orpc.statusPage.list.queryOptions({ input: {} }),
		enabled: hasAccess,
	});

	const deleteMutation = useMutation({
		...orpc.statusPage.delete.mutationOptions(),
	});

	const handleDeleteAction = async (id: string) => {
		try {
			await deleteMutation.mutateAsync({ id });
			toast.success("Status page deleted");
			pagesQuery.refetch();
		} catch {
			// handled by global mutation cache
		}
	};

	return (
		<ErrorBoundary>
			<div className="h-full overflow-y-auto">
				<PageHeader
					count={hasAccess ? pagesQuery.data?.length : undefined}
					description="Public status pages for your monitors"
					icon={<BrowserIcon />}
					right={
						hasAccess ? (
							<Button onClick={() => setIsCreateOpen(true)}>
								<PlusIcon />
								Create
							</Button>
						) : undefined
					}
					title="Status Pages"
				/>

				<FeatureAccessGate
					flagKey="monitors"
					loadingFallback={<List.DefaultLoading />}
				>
					<List.Content<StatusPageItem>
						emptyProps={{
							action: {
								label: "Create Status Page",
								onClick: () => setIsCreateOpen(true),
							},
							description:
								"Create a public status page to keep users informed about availability.",
							icon: <BrowserIcon weight="duotone" />,
							title: "No status pages yet",
						}}
						errorProps={{
							action: { label: "Retry", onClick: () => pagesQuery.refetch() },
							description: "Something went wrong while fetching status pages.",
							icon: <BrowserIcon />,
							title: "Failed to load",
						}}
						gatePending={isAccessLoading}
						query={pagesQuery as ListQuerySlice<StatusPageItem>}
					>
						{(items) => (
							<List className="rounded bg-card">
								{items.map((p) => (
									<StatusPageRow
										key={p.id}
										onDeleteAction={handleDeleteAction}
										page={p}
									/>
								))}
							</List>
						)}
					</List.Content>
				</FeatureAccessGate>

				{isCreateOpen ? (
					<CreateStatusPageSheet
						onCloseAction={() => setIsCreateOpen(false)}
						onSaveAction={() => pagesQuery.refetch()}
						open={isCreateOpen}
					/>
				) : null}
			</div>
		</ErrorBoundary>
	);
}

function StatusPageRow({
	page,
	onDeleteAction,
}: {
	page: StatusPageItem;
	onDeleteAction: (id: string) => void;
}) {
	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		const target = e.target as HTMLElement;
		if (
			target.closest("[data-dropdown-trigger]") ||
			target.closest("[data-radix-popper-content-wrapper]")
		) {
			e.preventDefault();
		}
	};

	return (
		<List.Row asChild>
			<Link href={`/monitors/status-pages/${page.id}`} onClick={handleClick}>
				<List.Cell>
					<div className="flex size-8 items-center justify-center rounded bg-primary/10 text-primary">
						<BrowserIcon className="size-4" weight="duotone" />
					</div>
				</List.Cell>

				<List.Cell className="w-40 min-w-0 lg:w-52">
					<p className="truncate font-medium text-foreground text-sm">
						{page.title}
					</p>
				</List.Cell>

				<List.Cell grow>
					<p className="truncate text-muted-foreground text-xs">
						/status/{page.slug}
					</p>
				</List.Cell>

				<List.Cell className="hidden w-16 md:block">
					<Badge variant={page.isPublished ? "green" : "gray"}>
						{page.isPublished ? "Published" : "Draft"}
					</Badge>
				</List.Cell>

				<List.Cell action>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label="Status page actions"
								className="size-8 opacity-50 hover:opacity-100 data-[state=open]:opacity-100"
								data-dropdown-trigger
								size="icon"
								variant="ghost"
							>
								<DotsThreeIcon className="size-5" weight="bold" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							<DropdownMenuItem asChild className="gap-2">
								<a
									href={getStatusPageUrl(page.slug)}
									rel="noopener noreferrer"
									target="_blank"
								>
									<ArrowSquareOutIcon className="size-4" weight="duotone" />
									View Page
								</a>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="gap-2 text-destructive focus:text-destructive"
								onClick={() => onDeleteAction(page.id)}
								variant="destructive"
							>
								<TrashIcon
									className="size-4 fill-destructive"
									weight="duotone"
								/>
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</List.Cell>
			</Link>
		</List.Row>
	);
}
