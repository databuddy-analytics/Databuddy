"use client";

import { FaviconImage } from "@/components/analytics/favicon-image";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { TopBar } from "@/components/layout/top-bar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useDateFilters } from "@/hooks/use-date-filters";
import { getDeviceIcon } from "@/components/device-icon";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";
import type { DynamicQueryFilter } from "@/stores/jotai/filterAtoms";
import {
	getCountryCode,
	getCountryName,
} from "@databuddy/shared/country-codes";
import type { ProfileData } from "@/types/analytics";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	GlobeIcon,
	LightningIcon,
	UsersIcon,
} from "@databuddy/ui/icons";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useAtomValue } from "jotai";
import Image from "next/image";
import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateProfileName } from "./[userId]/_components/generate-profile-name";
import { type ProfileSort, useProfilesData } from "./use-users";
import { useEventNames } from "./use-event-names";
import { Badge, EmptyState, Skeleton, Tooltip, dayjs } from "@databuddy/ui";
import { DropdownMenu } from "@databuddy/ui/client";

const wwwRegex = /^www\./;

type SortField =
	| "session_count"
	| "total_events"
	| "last_visit"
	| "first_visit";

interface SortState {
	field: SortField;
	order: "asc" | "desc";
}

type PresetKey = "all" | "power" | "new" | "returning";

interface PresetConfig {
	filters: DynamicQueryFilter[];
	label: string;
	sort?: { field: SortField; order: "asc" | "desc" };
}

const PRESETS: Record<PresetKey, PresetConfig> = {
	all: { label: "All", filters: [] },
	power: {
		label: "Power users",
		filters: [{ field: "session_count", operator: "not_in", value: [1, 2] }],
		sort: { field: "session_count", order: "desc" },
	},
	new: {
		label: "New",
		filters: [{ field: "session_count", operator: "eq", value: 1 }],
	},
	returning: {
		label: "Returning",
		filters: [{ field: "session_count", operator: "ne", value: 1 }],
	},
};

function SortableHeader({
	label,
	field,
	sort,
	onSort,
}: {
	label: string;
	field: SortField;
	sort: SortState;
	onSort: (field: SortField) => void;
}) {
	const isActive = sort.field === field;
	return (
		<button
			className="flex items-center gap-1 transition-colors hover:text-foreground"
			onClick={() => onSort(field)}
			type="button"
		>
			{label}
			{isActive ? (
				sort.order === "desc" ? (
					<ArrowDownIcon className="size-3" />
				) : (
					<ArrowUpIcon className="size-3" />
				)
			) : (
				<ArrowDownIcon className="size-3 opacity-0 group-hover/th:opacity-30" />
			)}
		</button>
	);
}

function SkeletonRow() {
	return (
		<TableRow className="h-[49px]">
			<TableCell className="h-[49px] py-2">
				<div className="flex items-center gap-2.5">
					<Skeleton className="size-6 shrink-0 rounded-full" />
					<Skeleton className="h-4 w-24" />
				</div>
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<div className="flex items-center gap-2">
					<Skeleton className="size-4 shrink-0 rounded" />
					<Skeleton className="h-4 w-16" />
				</div>
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<div className="flex items-center gap-1">
					<Skeleton className="size-4 shrink-0 rounded" />
					<Skeleton className="size-4 shrink-0 rounded" />
					<Skeleton className="size-4 shrink-0 rounded" />
				</div>
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<div className="flex items-center gap-1.5">
					<Skeleton className="size-3.5 shrink-0 rounded" />
					<Skeleton className="h-4 w-16" />
				</div>
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<Skeleton className="h-4 w-6" />
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<Skeleton className="h-4 w-6" />
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<Skeleton className="h-4 w-6" />
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<Skeleton className="h-5 w-12 rounded-full" />
			</TableCell>
			<TableCell className="h-[49px] py-2">
				<Skeleton className="h-4 w-14" />
			</TableCell>
		</TableRow>
	);
}

export default function UsersPage() {
	const params = useParams();
	const { id: websiteId } = params;

	if (!websiteId || typeof websiteId !== "string") {
		notFound();
	}

	const router = useRouter();
	const { dateRange } = useDateFilters();
	const globalFilters = useAtomValue(dynamicQueryFiltersAtom);

	const [activePreset, setActivePreset] = useState<PresetKey>("all");
	const [sort, setSort] = useState<SortState>({
		field: "last_visit",
		order: "desc",
	});
	const [eventFilter, setEventFilter] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [allUsers, setAllUsers] = useState<ProfileData[]>([]);
	const [isReplacing, setIsReplacing] = useState(false);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLTableCellElement | null>(
		null
	);
	const [scrollContainerRef, setScrollContainerRef] =
		useState<HTMLDivElement | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const { eventNames } = useEventNames(websiteId, dateRange);

	const mergedFilters = useMemo(() => {
		const preset = PRESETS[activePreset];
		const filters: DynamicQueryFilter[] = [
			...globalFilters,
			...(preset?.filters || []),
		];
		if (eventFilter) {
			filters.push({
				field: "event_name",
				operator: "eq",
				value: eventFilter,
			});
		}
		return filters;
	}, [globalFilters, activePreset, eventFilter]);

	const profileSort: ProfileSort = useMemo(
		() => ({ field: sort.field, order: sort.order }),
		[sort.field, sort.order]
	);

	const { profiles, pagination, isLoading, isError, error } = useProfilesData(
		websiteId,
		dateRange,
		50,
		page,
		mergedFilters,
		undefined,
		profileSort
	);

	const hasUsersRef = useRef(false);
	hasUsersRef.current = allUsers.length > 0;

	useEffect(() => {
		setPage(1);
		if (hasUsersRef.current) {
			setIsReplacing(true);
		} else {
			setIsInitialLoad(true);
		}
	}, [dateRange, mergedFilters, sort]);

	const handleSort = useCallback((field: SortField) => {
		setSort((prev) => {
			if (prev.field === field) {
				return { field, order: prev.order === "desc" ? "asc" : "desc" };
			}
			return { field, order: "desc" };
		});
	}, []);

	const handlePreset = useCallback((key: PresetKey) => {
		const preset = PRESETS[key];
		if (!preset) {
			return;
		}
		setActivePreset(key);
		if (preset.sort) {
			setSort(preset.sort);
		}
	}, []);

	const handleIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [entry] = entries;
			if (entry?.isIntersecting && pagination.hasNext && !isLoading) {
				setPage((prev) => prev + 1);
			}
		},
		[pagination.hasNext, isLoading]
	);

	useEffect(() => {
		if (!(loadMoreRef && scrollContainerRef)) {
			return;
		}

		const observer = new IntersectionObserver(handleIntersection, {
			root: scrollContainerRef,
			threshold: 0.1,
			rootMargin: "300px",
		});

		observer.observe(loadMoreRef);

		return () => {
			observer.disconnect();
		};
	}, [loadMoreRef, scrollContainerRef, handleIntersection]);

	useEffect(() => {
		if (!profiles?.length) {
			if (!isLoading && isReplacing) {
				setAllUsers([]);
				setIsReplacing(false);
			}
			return;
		}

		if (isReplacing) {
			setAllUsers(profiles);
			setIsReplacing(false);
			setIsInitialLoad(false);
			return;
		}

		setAllUsers((prev) => {
			const existingUsers = new Map(prev.map((u) => [u.visitor_id, u]));
			let hasNewUsers = false;

			for (const profile of profiles) {
				if (!existingUsers.has(profile.visitor_id)) {
					existingUsers.set(profile.visitor_id, profile);
					hasNewUsers = true;
				}
			}

			if (hasNewUsers) {
				return Array.from(existingUsers.values());
			}

			return prev;
		});
		setIsInitialLoad(false);
	}, [profiles, isLoading, isReplacing]);

	const columns = useMemo<ColumnDef<ProfileData>[]>(
		() => [
			{
				id: "user_id",
				header: "User",
				accessorKey: "visitor_id",
				cell: ({ row }) => {
					const profileName = generateProfileName(row.original.visitor_id);
					return (
						<div className="flex items-center gap-2.5">
							<Image
								alt=""
								className="size-6 shrink-0 rounded"
								height={32}
								src={`https://api.dicebear.com/9.x/glass/svg?seed=${row.original.visitor_id}`}
								unoptimized
								width={32}
							/>
							<span className="truncate font-medium">{profileName}</span>
						</div>
					);
				},
				size: 180,
			},
			{
				id: "location",
				header: "Location",
				cell: ({ row }) => {
					const country = row.original.country || "";
					const countryCode = getCountryCode(country);
					const countryName = getCountryName(countryCode);
					const isUnknown = !countryCode || countryCode === "Unknown";

					return (
						<div className="flex items-center gap-2">
							{isUnknown ? (
								<GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
							) : (
								<CountryFlag country={countryCode} size="sm" />
							)}
							<span className="truncate text-sm">
								{isUnknown ? "Unknown" : countryName || countryCode}
							</span>
						</div>
					);
				},
				size: 130,
			},
			{
				id: "device",
				header: "Device",
				cell: ({ row }) => {
					const browserName = row.original.browser_name || "Unknown";
					const osName = row.original.os_name || "Unknown";
					return (
						<div
							className="flex items-center gap-1"
							title={`${browserName} on ${osName}`}
						>
							{getDeviceIcon(row.original.device_type)}
							<BrowserIcon name={browserName} size="sm" />
							<OSIcon name={osName} size="sm" />
						</div>
					);
				},
				size: 80,
			},
			{
				id: "referrer",
				header: "Source",
				cell: ({ row }) => {
					const referrer = row.original.referrer;

					if (!referrer || referrer === "direct" || referrer === "") {
						return (
							<span className="text-muted-foreground text-sm">Direct</span>
						);
					}

					try {
						const url = new URL(referrer);
						const hostname = url.hostname.replace(wwwRegex, "");

						return <Source referrer={hostname} />;
					} catch {
						return (
							<span className="block max-w-[100px] truncate text-sm">
								{referrer}
							</span>
						);
					}
				},
				size: 120,
			},
			{
				id: "sessions",
				header: () => (
					<SortableHeader
						field="session_count"
						label="Sessions"
						onSort={handleSort}
						sort={sort}
					/>
				),
				cell: ({ row }) => (
					<span className="font-medium tabular-nums">
						{row.original.session_count ?? 0}
					</span>
				),
				size: 90,
			},
			{
				id: "pages",
				header: () => (
					<SortableHeader
						field="total_events"
						label="Pages"
						onSort={handleSort}
						sort={sort}
					/>
				),
				cell: ({ row }) => (
					<span className="font-medium tabular-nums">
						{row.original.total_events ?? 0}
					</span>
				),
				size: 80,
			},
			{
				id: "events",
				header: "Events",
				cell: ({ row }) => {
					const count = row.original.custom_event_count ?? 0;
					if (count === 0) {
						return <span className="text-muted-foreground text-sm">0</span>;
					}
					return (
						<Tooltip
							content={`${row.original.unique_event_names ?? 0} unique event types`}
							side="top"
						>
							<span className="flex items-center gap-1 font-medium tabular-nums">
								<LightningIcon className="size-3 text-amber-500" />
								{count}
							</span>
						</Tooltip>
					);
				},
				size: 70,
			},
			{
				id: "type",
				header: "Type",
				cell: ({ row }) => {
					const sessionCount = row.original.session_count ?? 0;
					const isReturning = sessionCount > 1;
					return (
						<Badge variant={isReturning ? "default" : "muted"}>
							{isReturning ? "Return" : "New"}
						</Badge>
					);
				},
				size: 70,
			},
			{
				id: "last_visit",
				header: () => (
					<SortableHeader
						field="last_visit"
						label="Last seen"
						onSort={handleSort}
						sort={sort}
					/>
				),
				accessorKey: "last_visit",
				cell: ({ row }) => (
					<span className="text-muted-foreground text-sm">
						{row.original.last_visit
							? dayjs.utc(row.original.last_visit).fromNow()
							: "—"}
					</span>
				),
				size: 100,
			},
		],
		[sort, handleSort]
	);

	const table = useReactTable({
		data: allUsers,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.visitor_id,
	});

	const presetBar = (
		<div className="flex items-center gap-1 border-border border-b px-3 py-1.5">
			{(Object.keys(PRESETS) as PresetKey[]).map((key) => (
				<button
					className={`rounded-md px-2.5 py-1 font-medium text-xs transition-colors ${
						activePreset === key
							? "bg-secondary text-foreground"
							: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
					}`}
					key={key}
					onClick={() => handlePreset(key)}
					type="button"
				>
					{PRESETS[key]?.label}
				</button>
			))}

			{eventNames.length > 0 && (
				<>
					<div className="mx-1 h-4 w-px bg-border" />
					{eventFilter ? (
						<button
							className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary text-xs transition-colors hover:bg-primary/15"
							onClick={() => setEventFilter(null)}
							type="button"
						>
							<LightningIcon className="size-3" />
							{eventFilter}
							<span className="text-[10px] leading-none">✕</span>
						</button>
					) : (
						<DropdownMenu>
							<DropdownMenu.Trigger
								render={
									<button
										className="flex items-center gap-1 rounded-md px-2.5 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-secondary/50 hover:text-foreground"
										type="button"
									>
										<LightningIcon className="size-3" />
										Event filter
									</button>
								}
							/>
							<DropdownMenu.Content align="start" side="bottom">
								<DropdownMenu.Group>
									<DropdownMenu.GroupLabel>
										Filter by custom event
									</DropdownMenu.GroupLabel>
									{eventNames.map((name) => (
										<DropdownMenu.Item
											key={name}
											onClick={() => setEventFilter(name)}
										>
											{name}
										</DropdownMenu.Item>
									))}
								</DropdownMenu.Group>
							</DropdownMenu.Content>
						</DropdownMenu>
					)}
				</>
			)}
		</div>
	);

	if (isLoading && isInitialLoad) {
		return (
			<div className="flex h-full flex-col">
				<TopBar.Title>
					<h1 className="font-semibold text-sm">Users</h1>
				</TopBar.Title>

				{presetBar}

				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<div className="overflow-auto">
						<Table>
							<TableHeader className="sticky top-0 z-10 bg-accent backdrop-blur-sm">
								<TableRow className="bg-accent shadow-[0_0_0_0.5px_var(--border)]">
									{columns.map((column) => (
										<TableHead
											className="h-[39px]"
											key={column.id}
											style={{ width: column.size }}
										>
											{typeof column.header === "string" ? column.header : null}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{Array.from({ length: 10 }).map((_, i) => (
									<SkeletonRow key={i} />
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex h-full flex-col">
				<TopBar.Title>
					<h1 className="font-semibold text-sm">Users</h1>
				</TopBar.Title>

				<div className="flex min-h-0 flex-1 flex-col items-center justify-center py-24 text-center text-muted-foreground">
					<UsersIcon className="mb-4 size-12 opacity-50" />
					<p className="mb-2 font-medium text-lg">Failed to load users</p>
					<p className="text-sm">
						{error?.message || "There was an error loading the users"}
					</p>
				</div>
			</div>
		);
	}

	if (!(isReplacing || isInitialLoad) && (!allUsers || allUsers.length === 0)) {
		return (
			<div className="flex h-full flex-col">
				<TopBar.Title>
					<h1 className="font-semibold text-sm">Users</h1>
				</TopBar.Title>

				{presetBar}

				<EmptyState
					description="Users appear here once visitors arrive."
					icon={<UsersIcon />}
					title="No users yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Users</h1>
			</TopBar.Title>

			{presetBar}

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div
					className={`h-full overflow-auto transition-opacity duration-150 ${isReplacing ? "pointer-events-none opacity-50" : ""}`}
					ref={setScrollContainerRef}
				>
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-accent backdrop-blur-sm">
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow
									className="bg-accent shadow-[0_0_0_0.5px_var(--border)]"
									key={headerGroup.id}
								>
									{headerGroup.headers.map((header) => (
										<TableHead
											className="group/th h-[39px]"
											key={header.id}
											style={{
												width: header.getSize(),
											}}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{table.getRowModel().rows.map((row) => (
								<TableRow
									className="h-[49px] cursor-pointer focus-visible:bg-accent/70 focus-visible:outline-none"
									key={row.id}
									onClick={() => {
										router.push(
											`/websites/${websiteId}/users/${row.original.visitor_id}`
										);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											e.currentTarget.click();
											return;
										}
										if (e.key === "ArrowDown" || e.key === "j") {
											e.preventDefault();
											(
												e.currentTarget.nextElementSibling as HTMLElement | null
											)?.focus();
											return;
										}
										if (e.key === "ArrowUp" || e.key === "k") {
											e.preventDefault();
											(
												e.currentTarget
													.previousElementSibling as HTMLElement | null
											)?.focus();
											return;
										}
										if (e.key === "Escape") {
											e.preventDefault();
											(e.currentTarget as HTMLElement).blur();
										}
									}}
									tabIndex={0}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											className="h-[49px] py-2"
											key={cell.id}
											style={{
												width: cell.column.getSize(),
											}}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
								</TableRow>
							))}

							{pagination.hasNext && (
								<>
									<TableRow>
										<TableCell
											className="h-0 p-0"
											colSpan={columns.length}
											ref={setLoadMoreRef}
										/>
									</TableRow>
									{isLoading && (
										<>
											<SkeletonRow />
											<SkeletonRow />
											<SkeletonRow />
										</>
									)}
								</>
							)}
						</TableBody>
					</Table>
				</div>
			</div>
		</div>
	);
}

const Source = ({ referrer }: { referrer: string }) => {
	const [isTextTruncated, setIsTextTruncated] = useState(false);

	const checkTextOverflow = (node: HTMLSpanElement | null) => {
		if (node) {
			setIsTextTruncated(node.scrollWidth > node.clientWidth);
		}
	};

	const span = (
		<span className="truncate text-sm" ref={checkTextOverflow}>
			{referrer}
		</span>
	);

	return (
		<div className="flex min-w-0 max-w-[100px] items-center gap-1.5">
			<FaviconImage domain={referrer} size={14} />
			{isTextTruncated ? (
				<Tooltip content={referrer} side="right">
					{span}
				</Tooltip>
			) : (
				span
			)}
		</div>
	);
};
