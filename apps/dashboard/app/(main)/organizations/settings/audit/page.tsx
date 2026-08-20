"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	formatDateTime,
	Skeleton,
	Text,
} from "@databuddy/ui";
import { ShieldCheckIcon } from "@databuddy/ui/icons";
import { useOrganizations } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";

const outcomeVariant = {
	denied: "warning",
	failure: "destructive",
	success: "success",
} as const;

function formatAction(action: string): string {
	return action
		.split(".")
		.map((part) => part.replaceAll("_", " "))
		.join(" / ");
}

function getErrorCode(error: unknown): string | undefined {
	if (!(error && typeof error === "object")) {
		return;
	}
	const details = error as {
		code?: string;
		data?: { code?: string };
	};
	return details.data?.code ?? details.code;
}

function AuditSkeleton() {
	return (
		<div className="mx-auto max-w-4xl space-y-6 p-5">
			<Card>
				<Card.Header>
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-3 w-64" />
				</Card.Header>
				<Card.Content className="space-y-3">
					{["a", "b", "c", "d"].map((key) => (
						<div className="flex items-center gap-3" key={key}>
							<Skeleton className="size-2 rounded-full" />
							<Skeleton className="h-4 flex-1" />
							<Skeleton className="h-4 w-32" />
						</div>
					))}
				</Card.Content>
			</Card>
		</div>
	);
}

export default function AuditLogPage() {
	const { activeOrganization } = useOrganizations();
	const query = useInfiniteQuery({
		queryKey: [...orpc.audit.list.key(), activeOrganization?.id] as const,
		queryFn: ({ pageParam }) =>
			orpc.audit.list.call({
				limit: 50,
				organizationId: activeOrganization?.id,
				...(pageParam ? { cursor: pageParam } : {}),
			}),
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) =>
			lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
		enabled: Boolean(activeOrganization?.id),
	});

	const events = query.data?.pages.flatMap((page) => page.events) ?? [];

	if (!activeOrganization || query.isPending) {
		return <AuditSkeleton />;
	}

	if (query.isError && events.length === 0) {
		const isAccessError = ["FORBIDDEN", "UNAUTHORIZED"].includes(
			getErrorCode(query.error) ?? ""
		);
		return (
			<div className="mx-auto max-w-4xl p-5">
				<EmptyState
					description={
						isAccessError
							? "Audit history is only available to organization administrators and owners."
							: "We could not load the audit history. Try again in a moment."
					}
					action={
						isAccessError
							? undefined
							: { label: "Retry", onClick: () => query.refetch() }
					}
					icon={<ShieldCheckIcon size={18} weight="duotone" />}
					title="Audit log unavailable"
					variant="error"
				/>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl space-y-6 p-5">
			<Card>
				<Card.Header className="flex-row items-start justify-between gap-4">
					<div>
						<Card.Title>Audit log</Card.Title>
						<Card.Description>
							Privileged activity recorded for {activeOrganization.name}.
						</Card.Description>
					</div>
					<ShieldCheckIcon className="size-5 text-muted-foreground" />
				</Card.Header>
				<Card.Content className="p-0">
					{events.length === 0 ? (
						<EmptyState
							description="New organization, access, flag, and workspace changes will appear here."
							icon={<ShieldCheckIcon size={18} weight="duotone" />}
							title="No audit events yet"
							variant="minimal"
						/>
					) : (
						<div className="divide-y">
							{events.map((event) => (
								<div
									className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
									key={event.id}
								>
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<Text className="font-medium capitalize" variant="label">
												{formatAction(event.action)}
											</Text>
											<Badge size="sm" variant={outcomeVariant[event.outcome]}>
												{event.outcome}
											</Badge>
										</div>
										<Text
											className="mt-1 truncate"
											tone="muted"
											variant="caption"
										>
											{event.actorDisplayName ?? event.actorId} · {event.source}
										</Text>
									</div>
									<Text
										className="shrink-0 tabular-nums"
										tone="muted"
										variant="caption"
									>
										{formatDateTime(event.createdAt)}
									</Text>
								</div>
							))}
						</div>
					)}
				</Card.Content>
				{query.isFetchNextPageError ? (
					<Card.Footer className="items-center justify-end gap-3">
						<Text tone="muted" variant="caption">
							Could not load older events.
						</Text>
						<Button
							onClick={() => query.fetchNextPage()}
							size="sm"
							variant="outline"
						>
							Retry
						</Button>
					</Card.Footer>
				) : query.hasNextPage ? (
					<Card.Footer className="justify-end">
						<Button
							loading={query.isFetchingNextPage}
							onClick={() => query.fetchNextPage()}
							size="sm"
							variant="outline"
						>
							Load older events
						</Button>
					</Card.Footer>
				) : null}
			</Card>
		</div>
	);
}
