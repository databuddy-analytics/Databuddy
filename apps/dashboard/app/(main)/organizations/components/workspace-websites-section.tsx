"use client";

import { FaviconImage } from "@/components/analytics/favicon-image";
import { WebsiteDialog } from "@/components/website-dialog";
import type { Organization } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";
import { CaretRightIcon, GlobeIcon, PlusIcon } from "@databuddy/ui/icons";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, EmptyState, Skeleton, Text } from "@databuddy/ui";

interface WebsiteRowData {
	domain: string;
	id: string;
	name: string | null;
}

function WebsiteRow({ website }: { website: WebsiteRowData }) {
	return (
		<Link
			className="group grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-interactive-hover"
			href={`/websites/${website.id}`}
		>
			<FaviconImage
				altText={`${website.name} favicon`}
				className="size-8"
				domain={website.domain}
				fallbackIcon={
					<GlobeIcon
						className="absolute inset-0 m-auto text-muted-foreground"
						size={20}
					/>
				}
				size={32}
			/>
			<div className="min-w-0">
				<Text className="truncate" variant="label">
					{website.name}
				</Text>
				<Text className="truncate" tone="muted" variant="caption">
					{website.domain}
				</Text>
			</div>
			<CaretRightIcon className="size-4 shrink-0 text-muted-foreground/40 group-hover:translate-x-0.5 group-hover:text-foreground" />
		</Link>
	);
}

function WebsitesSkeleton() {
	return (
		<div className="divide-y">
			{[1, 2, 3].map((num) => (
				<div
					className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-3"
					key={num}
				>
					<Skeleton className="size-8 rounded" />
					<div className="space-y-1.5">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3 w-48" />
					</div>
					<Skeleton className="size-4" />
				</div>
			))}
		</div>
	);
}

export function WorkspaceWebsitesSection({
	organization,
}: {
	organization: Organization;
}) {
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const { data, isLoading, refetch } = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId: organization.id },
		}),
		refetchOnMount: true,
		staleTime: 0,
	});

	const websites = data ?? [];

	return (
		<Card id="websites">
			<Card.Header className="flex-row items-start justify-between gap-4">
				<div>
					<Card.Title>Websites</Card.Title>
					<Card.Description>
						{websites.length === 0
							? "Add a website to start tracking analytics"
							: `${websites.length} website${websites.length === 1 ? "" : "s"} tracked`}
					</Card.Description>
				</div>
				<Button
					onClick={() => setShowCreateDialog(true)}
					size="sm"
					variant="secondary"
				>
					<PlusIcon className="size-4 shrink-0" />
					New Website
				</Button>
			</Card.Header>
			<Card.Content className="p-0">
				{isLoading ? (
					<WebsitesSkeleton />
				) : websites.length === 0 ? (
					<div className="px-5 py-8">
						<EmptyState
							action={
								<Button
									onClick={() => setShowCreateDialog(true)}
									size="sm"
									variant="secondary"
								>
									<PlusIcon className="size-4 shrink-0" />
									Add Website
								</Button>
							}
							description="Add your first website to start tracking analytics."
							icon={<GlobeIcon />}
							title="No websites yet"
						/>
					</div>
				) : (
					<div className="divide-y">
						{websites.map((website) => (
							<WebsiteRow key={website.id} website={website} />
						))}
					</div>
				)}
			</Card.Content>

			<WebsiteDialog
				onOpenChange={setShowCreateDialog}
				onSave={() => {
					refetch();
				}}
				open={showCreateDialog}
			/>
		</Card>
	);
}
