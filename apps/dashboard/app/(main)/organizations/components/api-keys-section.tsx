"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiKeySheet } from "@/components/organizations/api-key-sheet";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import type { ApiKeyListItem } from "@/components/organizations/api-key-types";
import type { Organization } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";
import { ApiKeyRow } from "./api-key-row";
import {
	CaretDownIcon,
	LockSimpleIcon,
	MagnifyingGlassIcon,
	PlusIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import {
	Button,
	Card,
	EmptyState,
	Skeleton,
	Text,
	buttonVariants,
} from "@databuddy/ui";

type StatusFilter = "all" | "active" | "disabled" | "expired" | "revoked";
type TypeFilter = "all" | "user" | "sdk" | "automation";

const STATUS_LABEL: Record<StatusFilter, string> = {
	all: "All statuses",
	active: "Active",
	disabled: "Disabled",
	expired: "Expired",
	revoked: "Revoked",
};

const TYPE_LABEL: Record<TypeFilter, string> = {
	all: "All types",
	user: "User",
	sdk: "SDK",
	automation: "Automation",
};

function keyStatus(k: ApiKeyListItem): Exclude<StatusFilter, "all"> {
	if (k.revokedAt) {
		return "revoked";
	}
	if (k.expiresAt && new Date(k.expiresAt) < new Date()) {
		return "expired";
	}
	if (!k.enabled) {
		return "disabled";
	}
	return "active";
}

function ApiKeysSkeleton() {
	return (
		<div className="divide-y">
			{[1, 2, 3].map((n) => (
				<div className="flex items-center gap-3 px-5 py-3" key={n}>
					<Skeleton className="size-7 rounded" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-3.5 w-36" />
						<Skeleton className="h-3 w-44" />
					</div>
					<Skeleton className="h-5 w-16 rounded-full" />
					<Skeleton className="size-3" />
				</div>
			))}
		</div>
	);
}

export function ApiKeysSection({
	organization,
}: {
	organization: Organization;
}) {
	const [sheetOpen, setSheetOpen] = useState(false);
	const [selectedKey, setSelectedKey] = useState<ApiKeyListItem | null>(null);
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const { isSwitchingOrganization } = useOrganizationsContext();

	const openCreate = () => {
		setSelectedKey(null);
		setSheetOpen(true);
	};
	const openEdit = (key: ApiKeyListItem) => {
		setSelectedKey(key);
		setSheetOpen(true);
	};

	const { data, isLoading } = useQuery({
		...orpc.apikeys.list.queryOptions({
			input: { organizationId: organization.id },
		}),
		refetchOnMount: true,
		staleTime: 0,
	});

	const isBusy = isLoading || isSwitchingOrganization;
	const items = isSwitchingOrganization
		? []
		: ((data ?? []) as ApiKeyListItem[]);
	const activeCount = items.filter((k) => k.enabled && !k.revokedAt).length;
	const isEmpty = items.length === 0;

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return items.filter((k) => {
			if (statusFilter !== "all" && keyStatus(k) !== statusFilter) {
				return false;
			}
			if (typeFilter !== "all" && k.type !== typeFilter) {
				return false;
			}
			if (!q) {
				return true;
			}
			return (
				k.name.toLowerCase().includes(q) ||
				k.start.toLowerCase().includes(q) ||
				(k.tags ?? []).some((t) => t.toLowerCase().includes(q))
			);
		});
	}, [items, query, statusFilter, typeFilter]);

	const hasActiveFilters =
		query.trim() !== "" || statusFilter !== "all" || typeFilter !== "all";

	return (
		<Card id="api-keys">
			<Card.Header className="flex-row items-start justify-between gap-4">
				<div>
					<Card.Title>API Keys</Card.Title>
					<Card.Description>
						{isSwitchingOrganization
							? "Switching workspace…"
							: isEmpty
								? `Create keys for programmatic access to ${organization.name}`
								: `${activeCount} active of ${items.length} key${items.length === 1 ? "" : "s"} for ${organization.name}`}
					</Card.Description>
				</div>
				<Button
					disabled={isSwitchingOrganization}
					onClick={openCreate}
					size="sm"
					variant="secondary"
				>
					<PlusIcon size={14} />
					Create Key
				</Button>
			</Card.Header>

			{!(isEmpty || isBusy) && (
				<div className="flex items-center gap-2 border-border/60 border-b px-5 py-2">
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<MagnifyingGlassIcon className="size-3.5 shrink-0 text-muted-foreground" />
						<input
							className="w-full bg-transparent text-foreground text-xs outline-none placeholder:text-muted-foreground"
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search name, key start, or tag…"
							value={query}
						/>
					</div>
					{hasActiveFilters && (
						<Text className="tabular-nums" tone="muted" variant="caption">
							{filtered.length} of {items.length}
						</Text>
					)}
					<DropdownMenu>
						<DropdownMenu.Trigger
							className={buttonVariants({ size: "sm", variant: "secondary" })}
						>
							{STATUS_LABEL[statusFilter]}
							<CaretDownIcon className="size-3" weight="fill" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.RadioGroup
								onValueChange={(v) => setStatusFilter(v as StatusFilter)}
								value={statusFilter}
							>
								{(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => (
									<DropdownMenu.RadioItem key={k} value={k}>
										{STATUS_LABEL[k]}
									</DropdownMenu.RadioItem>
								))}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu>
					<DropdownMenu>
						<DropdownMenu.Trigger
							className={buttonVariants({ size: "sm", variant: "secondary" })}
						>
							{TYPE_LABEL[typeFilter]}
							<CaretDownIcon className="size-3" weight="fill" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.RadioGroup
								onValueChange={(v) => setTypeFilter(v as TypeFilter)}
								value={typeFilter}
							>
								{(Object.keys(TYPE_LABEL) as TypeFilter[]).map((k) => (
									<DropdownMenu.RadioItem key={k} value={k}>
										{TYPE_LABEL[k]}
									</DropdownMenu.RadioItem>
								))}
							</DropdownMenu.RadioGroup>
						</DropdownMenu.Content>
					</DropdownMenu>
				</div>
			)}

			<Card.Content className="p-0">
				{isBusy ? (
					<>
						{isSwitchingOrganization && (
							<p className="sr-only" role="status">
								Switching workspace…
							</p>
						)}
						<ApiKeysSkeleton />
					</>
				) : isEmpty ? (
					<div className="px-5 py-8">
						<EmptyState
							action={
								<Button onClick={openCreate} size="sm">
									<PlusIcon size={14} />
									Create your first key
								</Button>
							}
							description={`API keys created here only authenticate requests for ${organization.name}. Keys are shown once at creation.`}
							icon={<LockSimpleIcon />}
							title="No API keys in this workspace"
						/>
					</div>
				) : filtered.length === 0 ? (
					<div className="px-5 py-8 text-center">
						<Text tone="muted" variant="caption">
							No keys match the current filters.
						</Text>
						{hasActiveFilters && (
							<div className="mt-2">
								<Button
									onClick={() => {
										setQuery("");
										setStatusFilter("all");
										setTypeFilter("all");
									}}
									size="sm"
									variant="ghost"
								>
									Clear filters
								</Button>
							</div>
						)}
					</div>
				) : (
					<div className="divide-y">
						{filtered.map((apiKey) => (
							<ApiKeyRow
								apiKey={apiKey}
								key={apiKey.id}
								onSelect={() => openEdit(apiKey)}
							/>
						))}
					</div>
				)}
			</Card.Content>

			<ApiKeySheet
				apiKey={selectedKey}
				onOpenChangeAction={setSheetOpen}
				open={sheetOpen && !isSwitchingOrganization}
				organizationId={organization.id}
			/>
		</Card>
	);
}
