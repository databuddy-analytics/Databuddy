"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	formatDateTime,
	Skeleton,
	StatusDot,
	Text,
} from "@databuddy/ui";
import { DropdownMenu, Sheet } from "@databuddy/ui/client";
import {
	ArrowRightIcon,
	CaretUpDownIcon,
	CodeIcon,
	FileDownloadIcon,
	FilterIcon,
	ShieldCheckIcon,
} from "@databuddy/ui/icons";
import {
	auditActionNames,
	auditActorTypeLabels,
	auditOutcomes,
	auditSourceLabels,
	getAuditActionLabel,
	getAuditTargetLabel,
	type AuditActionName,
	type AuditOutcome,
} from "@databuddy/shared/audit";
import { useOrganizations } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";

type AuditEvent = Awaited<
	ReturnType<typeof orpc.audit.list.call>
>["events"][number];

const outcomeVariant = {
	denied: "warning",
	failure: "destructive",
	success: "success",
} as const;

const outcomeDotColor: Record<
	AuditOutcome,
	"success" | "warning" | "destructive"
> = {
	denied: "warning",
	failure: "destructive",
	success: "success",
};

type OutcomeFilter = "all" | AuditOutcome;
type ActionFilter = "all" | AuditActionName;
type DateRangeFilter = "all" | "7d" | "30d" | "90d";
type TargetFilter =
	| "all"
	| "api_key"
	| "flag"
	| "website"
	| "organization"
	| "member"
	| "invitation";

const outcomeFilterLabels: Record<OutcomeFilter, string> = {
	all: "All outcomes",
	denied: "Denied",
	failure: "Failed",
	success: "Successful",
};

const dateRangeFilterLabels: Record<DateRangeFilter, string> = {
	all: "All time",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
};

const targetFilterLabels: Record<TargetFilter, string> = {
	all: "All resources",
	api_key: "API keys",
	flag: "Feature flags",
	website: "Websites",
	organization: "Organizations",
	member: "Members",
	invitation: "Invitations",
};

const targetFilterOptions: TargetFilter[] = [
	"all",
	"api_key",
	"flag",
	"website",
	"organization",
	"member",
	"invitation",
];

const sensitiveAuditFieldPattern = /(^|_)(key|password|secret|token)(_|$)/i;

function getAuditDateRange(
	filter: DateRangeFilter
): { from: Date; to: Date } | Record<string, never> {
	if (filter === "all") {
		return {};
	}
	const to = new Date();
	const from = new Date(to);
	from.setDate(from.getDate() - Number.parseInt(filter, 10));
	return { from, to };
}

function getActionFilterLabel(action: ActionFilter): string {
	return action === "all" ? "All actions" : getAuditActionLabel(action);
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

function formatFieldName(value: string): string {
	return value
		.replaceAll("_", " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatChangeSummary(
	action: string,
	changes: Record<string, unknown>
): string | undefined {
	if (action.endsWith(".created") || action.endsWith(".deleted")) {
		return;
	}

	const fields = Object.keys(changes).filter((field) => field !== "deleted");
	if (fields.length === 0) {
		return;
	}

	const visibleFields = fields.slice(0, 3).map(formatFieldName);
	const remainingCount = fields.length - visibleFields.length;
	return `Changed ${visibleFields.join(", ")}${remainingCount > 0 ? ` +${remainingCount} more` : ""}`;
}

function getTargetSummary(event: {
	targetDisplayName: string | null;
	targetType: string;
}): string {
	if (event.targetDisplayName) {
		return `“${event.targetDisplayName}”`;
	}
	return getAuditTargetLabel(event.targetType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatAuditValue(value: unknown, field?: string): string {
	if (field && sensitiveAuditFieldPattern.test(field)) {
		return "Redacted";
	}
	if (value === undefined) {
		return "—";
	}
	if (value === null) {
		return "None";
	}
	if (typeof value === "boolean") {
		return value ? "Yes" : "No";
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number") {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return "Unavailable";
	}
}

function getChangeParts(value: unknown): {
	after: unknown;
	before: unknown;
} {
	if (isRecord(value) && ("before" in value || "after" in value)) {
		return { after: value.after, before: value.before };
	}
	return { after: value, before: undefined };
}

function DetailValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 space-y-1">
			<Text tone="muted" variant="caption">
				{label}
			</Text>
			<Text className="break-words" variant="label">
				{value}
			</Text>
		</div>
	);
}

function AuditEventDetail({
	event,
	onOpenChange,
}: {
	event: AuditEvent;
	onOpenChange: (open: boolean) => void;
}) {
	const changes = Object.entries(event.changes);
	const metadata = Object.entries(event.metadata);

	return (
		<Sheet onOpenChange={onOpenChange} open>
			<Sheet.Content className="sm:max-w-lg">
				<Sheet.Close />
				<Sheet.Header className="border-border/50 border-b">
					<div className="flex items-start gap-3 pr-7">
						<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded bg-secondary">
							<StatusDot color={outcomeDotColor[event.outcome]} size="lg" />
						</div>
						<div className="min-w-0">
							<Sheet.Title className="text-sm">
								{getAuditActionLabel(event.action)}
							</Sheet.Title>
							<Sheet.Description className="truncate">
								{getTargetSummary(event)} · {formatDateTime(event.createdAt)}
							</Sheet.Description>
						</div>
					</div>
				</Sheet.Header>
				<Sheet.Body className="space-y-6">
					<div className="grid grid-cols-2 gap-x-4 gap-y-5">
						<DetailValue
							label="Outcome"
							value={outcomeFilterLabels[event.outcome]}
						/>
						<DetailValue
							label="Actor"
							value={
								event.actorDisplayName ?? auditActorTypeLabels[event.actorType]
							}
						/>
						<DetailValue
							label="Source"
							value={auditSourceLabels[event.source]}
						/>
						<DetailValue
							label="Resource"
							value={getAuditTargetLabel(event.targetType)}
						/>
					</div>

					{event.reason ? (
						<div className="rounded border border-destructive/20 bg-destructive/5 px-3 py-2.5">
							<Text className="text-destructive" variant="label">
								{event.reason}
							</Text>
						</div>
					) : null}

					{changes.length > 0 ? (
						<section className="space-y-2">
							<Text className="font-semibold" variant="label">
								Changes
							</Text>
							<div className="divide-y rounded border border-border/60">
								{changes.map(([field, rawValue]) => {
									const change = getChangeParts(rawValue);
									return (
										<div
											className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2.5"
											key={field}
										>
											<Text className="break-words" variant="caption">
												{formatFieldName(field)}
											</Text>
											<Text
												className="break-words text-right"
												tone="muted"
												variant="caption"
											>
												{formatAuditValue(change.before, field)}
											</Text>
											<ArrowRightIcon
												aria-hidden="true"
												className="size-3 shrink-0 text-muted-foreground"
											/>
											<Text className="break-words" variant="caption">
												{formatAuditValue(change.after, field)}
											</Text>
										</div>
									);
								})}
							</div>
						</section>
					) : null}

					{metadata.length > 0 ? (
						<section className="space-y-2">
							<Text className="font-semibold" variant="label">
								Additional context
							</Text>
							<div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded border border-border/60 px-3 py-3">
								{metadata.map(([field, value]) => (
									<DetailValue
										key={field}
										label={formatFieldName(field)}
										value={formatAuditValue(value, field)}
									/>
								))}
							</div>
						</section>
					) : null}

					<section className="space-y-2">
						<Text className="font-semibold" variant="label">
							Technical context
						</Text>
						<div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded border border-border/60 px-3 py-3">
							<DetailValue
								label="Operation"
								value={event.operation ?? "Not recorded"}
							/>
							<DetailValue label="Event ID" value={event.id} />
							{event.requestId ? (
								<DetailValue label="Request ID" value={event.requestId} />
							) : null}
							{event.ip ? (
								<DetailValue label="IP address" value={event.ip} />
							) : null}
						</div>
					</section>
				</Sheet.Body>
			</Sheet.Content>
		</Sheet>
	);
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

function AuditEventRow({
	event,
	includeTechnical,
	onSelect,
}: {
	event: AuditEvent;
	includeTechnical: boolean;
	onSelect: (event: AuditEvent) => void;
}) {
	const changeSummary = formatChangeSummary(event.action, event.changes);

	return (
		<Button
			aria-label={`View details for ${getAuditActionLabel(event.action)} ${getTargetSummary(event)}`}
			className="group h-auto w-full items-start justify-between whitespace-normal rounded-none px-5 py-4 text-left font-normal active:scale-100"
			onClick={() => onSelect(event)}
			variant="ghost"
		>
			<div className="flex min-w-0 items-start gap-3">
				<div className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
					<StatusDot
						aria-hidden="true"
						color={outcomeDotColor[event.outcome]}
						size="sm"
					/>
				</div>
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<Text className="font-medium" variant="label">
							{getAuditActionLabel(event.action)}
						</Text>
						<Text className="truncate" tone="muted" variant="label">
							{getTargetSummary(event)}
						</Text>
						<Badge size="sm" variant={outcomeVariant[event.outcome]}>
							{outcomeFilterLabels[event.outcome]}
						</Badge>
					</div>
					<Text className="truncate" tone="muted" variant="caption">
						{event.actorDisplayName ?? auditActorTypeLabels[event.actorType]}
						{" · via "}
						{auditSourceLabels[event.source]}
					</Text>
					{changeSummary ? (
						<Text tone="muted" variant="caption">
							{changeSummary}
						</Text>
					) : null}
					{(includeTechnical || event.action === "rpc.mutation") &&
					event.operation ? (
						<Text className="font-mono" tone="muted" variant="caption">
							Operation: {event.operation}
						</Text>
					) : null}
					{event.reason ? (
						<Text className="text-destructive" variant="caption">
							{event.reason}
						</Text>
					) : null}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2 pl-3">
				<Text className="tabular-nums" tone="muted" variant="caption">
					{formatDateTime(event.createdAt)}
				</Text>
				<ArrowRightIcon
					aria-hidden="true"
					className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
				/>
			</div>
		</Button>
	);
}

function AuditFilters({
	actionFilter,
	dateRangeFilter,
	onActionFilterChange,
	onClear,
	onDateRangeFilterChange,
	onOutcomeFilterChange,
	onTargetFilterChange,
	outcomeFilter,
	targetFilter,
}: {
	actionFilter: ActionFilter;
	dateRangeFilter: DateRangeFilter;
	onActionFilterChange: (value: ActionFilter) => void;
	onClear: () => void;
	onDateRangeFilterChange: (value: DateRangeFilter) => void;
	onOutcomeFilterChange: (value: OutcomeFilter) => void;
	onTargetFilterChange: (value: TargetFilter) => void;
	outcomeFilter: OutcomeFilter;
	targetFilter: TargetFilter;
}) {
	const hasFilters =
		actionFilter !== "all" ||
		outcomeFilter !== "all" ||
		targetFilter !== "all" ||
		dateRangeFilter !== "30d";

	return (
		<Card.Content className="border-border/60 border-b p-3">
			<div className="flex flex-wrap items-center gap-2">
				<div className="flex items-center gap-1.5 pr-1">
					<FilterIcon
						aria-hidden="true"
						className="size-3.5 text-muted-foreground"
					/>
					<Text tone="muted" variant="caption">
						Filter activity
					</Text>
				</div>
				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button size="sm" variant="outline">
								{getActionFilterLabel(actionFilter)}
								<CaretUpDownIcon
									aria-hidden="true"
									className="size-3 text-muted-foreground"
								/>
							</Button>
						}
					/>
					<DropdownMenu.Content align="start">
						<DropdownMenu.RadioGroup
							onValueChange={(value) =>
								onActionFilterChange(value as ActionFilter)
							}
							value={actionFilter}
						>
							<DropdownMenu.RadioItem value="all">
								All actions
							</DropdownMenu.RadioItem>
							{auditActionNames.map((action) => (
								<DropdownMenu.RadioItem key={action} value={action}>
									{getAuditActionLabel(action)}
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button size="sm" variant="outline">
								{outcomeFilterLabels[outcomeFilter]}
								<CaretUpDownIcon
									aria-hidden="true"
									className="size-3 text-muted-foreground"
								/>
							</Button>
						}
					/>
					<DropdownMenu.Content align="start">
						<DropdownMenu.RadioGroup
							onValueChange={(value) =>
								onOutcomeFilterChange(value as OutcomeFilter)
							}
							value={outcomeFilter}
						>
							<DropdownMenu.RadioItem value="all">
								All outcomes
							</DropdownMenu.RadioItem>
							{auditOutcomes.map((outcome) => (
								<DropdownMenu.RadioItem key={outcome} value={outcome}>
									{outcomeFilterLabels[outcome]}
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button size="sm" variant="outline">
								{targetFilterLabels[targetFilter]}
								<CaretUpDownIcon
									aria-hidden="true"
									className="size-3 text-muted-foreground"
								/>
							</Button>
						}
					/>
					<DropdownMenu.Content align="start">
						<DropdownMenu.RadioGroup
							onValueChange={(value) =>
								onTargetFilterChange(value as TargetFilter)
							}
							value={targetFilter}
						>
							{targetFilterOptions.map((target) => (
								<DropdownMenu.RadioItem key={target} value={target}>
									{targetFilterLabels[target]}
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenu.Trigger
						render={
							<Button size="sm" variant="outline">
								{dateRangeFilterLabels[dateRangeFilter]}
								<CaretUpDownIcon
									aria-hidden="true"
									className="size-3 text-muted-foreground"
								/>
							</Button>
						}
					/>
					<DropdownMenu.Content align="start">
						<DropdownMenu.RadioGroup
							onValueChange={(value) =>
								onDateRangeFilterChange(value as DateRangeFilter)
							}
							value={dateRangeFilter}
						>
							{(Object.keys(dateRangeFilterLabels) as DateRangeFilter[]).map(
								(range) => (
									<DropdownMenu.RadioItem key={range} value={range}>
										{dateRangeFilterLabels[range]}
									</DropdownMenu.RadioItem>
								)
							)}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu>
				{hasFilters ? (
					<Button onClick={onClear} size="sm" variant="ghost">
						Clear filters
					</Button>
				) : null}
			</div>
		</Card.Content>
	);
}

export default function AuditLogPage() {
	const { activeOrganization } = useOrganizations();
	const [includeTechnical, setIncludeTechnical] = useState(false);
	const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
	const [dateRangeFilter, setDateRangeFilter] =
		useState<DateRangeFilter>("30d");
	const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
	const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
	const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const dateRange = useMemo(
		() => getAuditDateRange(dateRangeFilter),
		[dateRangeFilter]
	);
	const query = useInfiniteQuery({
		queryKey: [
			...orpc.audit.list.key(),
			activeOrganization?.id,
			actionFilter,
			dateRangeFilter,
			includeTechnical,
			outcomeFilter,
			targetFilter,
		] as const,
		queryFn: ({ pageParam }) =>
			orpc.audit.list.call({
				...(actionFilter === "all" ? {} : { action: actionFilter }),
				...dateRange,
				includeTechnical,
				limit: 50,
				organizationId: activeOrganization?.id,
				...(outcomeFilter === "all" ? {} : { outcome: outcomeFilter }),
				...(pageParam ? { cursor: pageParam } : {}),
				...(targetFilter === "all" ? {} : { targetType: targetFilter }),
			}),
		initialPageParam: null as string | null,
		getNextPageParam: (lastPage) =>
			lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined,
		enabled: Boolean(activeOrganization?.id),
	});

	const handleExport = async () => {
		if (!activeOrganization) {
			return;
		}
		setIsExporting(true);
		try {
			const result = await orpc.audit.export.call({
				...(actionFilter === "all" ? {} : { action: actionFilter }),
				...getAuditDateRange(dateRangeFilter),
				includeTechnical,
				organizationId: activeOrganization.id,
				...(outcomeFilter === "all" ? {} : { outcome: outcomeFilter }),
				...(targetFilter === "all" ? {} : { targetType: targetFilter }),
			});
			const blob = new Blob([result.content], {
				type: "text/csv;charset=utf-8",
			});
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.download = result.filename;
			link.href = url;
			link.click();
			window.URL.revokeObjectURL(url);
			if (result.truncated) {
				toast.warning(
					`Exported the first ${result.rowCount.toLocaleString()} events. Narrow the filters for the complete result.`
				);
			} else {
				toast.success(
					`Exported ${result.rowCount.toLocaleString()} audit events.`
				);
			}
		} catch {
			toast.error("Could not export the audit log. Try again in a moment.");
		} finally {
			setIsExporting(false);
		}
	};

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
				<Card.Header className="items-start gap-3 sm:flex-row sm:justify-between">
					<div>
						<Card.Title>Audit log</Card.Title>
						<Card.Description>
							Human-readable history of changes made in{" "}
							{activeOrganization.name}.
						</Card.Description>
					</div>
					<div className="flex items-center gap-2">
						<Button
							loading={isExporting}
							onClick={handleExport}
							size="sm"
							variant="outline"
						>
							<FileDownloadIcon aria-hidden="true" className="size-3.5" />
							Export CSV
						</Button>
						<Button
							aria-pressed={includeTechnical}
							onClick={() => setIncludeTechnical((current) => !current)}
							size="sm"
							variant="ghost"
						>
							<CodeIcon aria-hidden="true" className="size-3.5" />
							{includeTechnical
								? "Hide technical events"
								: "Show technical events"}
						</Button>
						<ShieldCheckIcon className="size-5 text-muted-foreground" />
					</div>
				</Card.Header>
				<AuditFilters
					actionFilter={actionFilter}
					dateRangeFilter={dateRangeFilter}
					onActionFilterChange={setActionFilter}
					onClear={() => {
						setActionFilter("all");
						setDateRangeFilter("30d");
						setOutcomeFilter("all");
						setTargetFilter("all");
					}}
					onDateRangeFilterChange={setDateRangeFilter}
					onOutcomeFilterChange={setOutcomeFilter}
					onTargetFilterChange={setTargetFilter}
					outcomeFilter={outcomeFilter}
					targetFilter={targetFilter}
				/>
				<Card.Content className="p-0">
					{events.length === 0 ? (
						<EmptyState
							description={
								actionFilter !== "all" ||
								outcomeFilter !== "all" ||
								targetFilter !== "all" ||
								dateRangeFilter !== "30d"
									? "Try clearing the filters to see more activity."
									: "New organization, access, flag, and workspace changes will appear here."
							}
							icon={<ShieldCheckIcon size={18} weight="duotone" />}
							title={
								actionFilter !== "all" ||
								outcomeFilter !== "all" ||
								targetFilter !== "all" ||
								dateRangeFilter !== "30d"
									? "No matching activity"
									: "No audit events yet"
							}
							variant="minimal"
						/>
					) : (
						<div className="divide-y">
							{events.map((event) => (
								<AuditEventRow
									event={event}
									includeTechnical={includeTechnical}
									key={event.id}
									onSelect={setSelectedEvent}
								/>
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
			{selectedEvent ? (
				<AuditEventDetail
					event={selectedEvent}
					onOpenChange={(open) => {
						if (!open) {
							setSelectedEvent(null);
						}
					}}
				/>
			) : null}
		</div>
	);
}
