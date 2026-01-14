"use client";

import {
	ArrowSquareOutIcon,
	BracketsSquareIcon,
	CopyIcon,
	FunnelIcon,
	LightningIcon,
	LinkIcon,
	MagnifyingGlassIcon,
	TagIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAtom } from "jotai";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useDateFilters } from "@/hooks/use-date-filters";
import { cn } from "@/lib/utils";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";
import type { RecentCustomEvent } from "../_components/types";
import { useEventsStream } from "./use-events-stream";

dayjs.extend(relativeTime);

type HasPropertiesFilter = "all" | "with" | "without";

const hasPropertiesOptions = [
	{ value: "all", label: "All events" },
	{ value: "with", label: "With properties" },
	{ value: "without", label: "Without properties" },
] as const;

function SkeletonRow() {
	return (
		<TableRow className="h-[65px]">
			<TableCell className="py-2">
				<Skeleton className="h-4 w-16" />
			</TableCell>
			<TableCell className="py-2">
				<Skeleton className="h-5 w-24" />
			</TableCell>
			<TableCell className="py-2">
				<Skeleton className="h-4 w-32" />
			</TableCell>
			<TableCell className="py-2">
				<div className="space-y-1">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-3 w-2/3" />
				</div>
			</TableCell>
			<TableCell className="py-2">
				<Skeleton className="h-6 w-6" />
			</TableCell>
		</TableRow>
	);
}

interface ActiveFilter {
	type: "event" | "path" | "property" | "hasProps";
	label: string;
	value: string;
	onRemoveAction: () => void;
}

function getFilterIcon(type: ActiveFilter["type"]) {
	switch (type) {
		case "event":
			return <LightningIcon className="size-3" weight="fill" />;
		case "path":
			return <LinkIcon className="size-3" />;
		case "property":
			return <TagIcon className="size-3" weight="fill" />;
		case "hasProps":
			return <BracketsSquareIcon className="size-3" />;
		default:
			return <FunnelIcon className="size-3" />;
	}
}

function ActiveFilters({ filters }: { filters: ActiveFilter[] }) {
	if (filters.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<span className="font-medium text-foreground/60 text-xs uppercase">
				Active:
			</span>
			{filters.map((filter) => (
				<div
					className="group flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 py-1 pr-1 pl-2.5 text-xs transition-colors hover:border-primary/30 hover:bg-primary/10"
					key={`${filter.type}-${filter.value}`}
				>
					<span className="text-primary/70">{getFilterIcon(filter.type)}</span>
					<span className="font-medium text-foreground">{filter.label}</span>
					<span className="text-foreground/60">=</span>
					<span className="max-w-[100px] truncate font-medium text-primary">
						{filter.value}
					</span>
					<button
						aria-label={`Remove ${filter.label} filter`}
						className="flex size-4 items-center justify-center rounded-full text-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
						onClick={filter.onRemoveAction}
						type="button"
					>
						<XIcon className="size-3" weight="bold" />
					</button>
				</div>
			))}
		</div>
	);
}

export default function EventsStreamPage() {
	const params = useParams();
	const { id: websiteId } = params;

	if (!websiteId || typeof websiteId !== "string") {
		notFound();
	}

	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const [page, setPage] = useState(1);
	const [allEvents, setAllEvents] = useState<RecentCustomEvent[]>([]);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLTableCellElement | null>(
		null
	);
	const [scrollContainerRef, setScrollContainerRef] =
		useState<HTMLDivElement | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Filter states with URL persistence
	const [searchQuery, setSearchQuery] = useQueryState(
		"search",
		parseAsString.withDefault("")
	);
	const [searchInput, setSearchInput] = useState(searchQuery);

	const debouncedSetSearchQuery = useDebouncedCallback(
		(value: string) => {
			setSearchQuery(value);
		},
		{ wait: 300 }
	);

	const handleSearchInputChange = useCallback(
		(value: string) => {
			setSearchInput(value);
			debouncedSetSearchQuery(value);
		},
		[debouncedSetSearchQuery]
	);

	useEffect(() => {
		setSearchInput(searchQuery);
	}, [searchQuery]);
	const [selectedEventType, setSelectedEventType] = useQueryState(
		"event",
		parseAsString.withDefault("all")
	);
	const [selectedPath, setSelectedPath] = useQueryState(
		"path",
		parseAsString.withDefault("all")
	);
	const [selectedPropertyKey, setSelectedPropertyKey] = useQueryState(
		"propKey",
		parseAsString.withDefault("all")
	);
	const [selectedPropertyValue, setSelectedPropertyValue] = useQueryState(
		"propVal",
		parseAsString.withDefault("all")
	);
	const [hasProperties, setHasProperties] = useQueryState(
		"hasProps",
		parseAsStringLiteral(["all", "with", "without"] as const).withDefault("all")
	);

	const { events, pagination, isLoading, isError, error } = useEventsStream(
		websiteId,
		dateRange,
		50,
		page,
		filters
	);

	// Handle events loading - using a ref to track previous dependencies
	const eventsKey = useMemo(
		() => JSON.stringify({ dateRange, filters }),
		[dateRange, filters]
	);

	const prevEventsKeyRef = useRef(eventsKey);
	if (prevEventsKeyRef.current !== eventsKey) {
		prevEventsKeyRef.current = eventsKey;
		setPage(1);
		setAllEvents([]);
		setIsInitialLoad(true);
	}

	// Handle intersection for infinite scroll
	const handleIntersection = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [entry] = entries;
			if (entry?.isIntersecting && pagination.hasNext && !isLoading) {
				setPage((prev) => prev + 1);
			}
		},
		[pagination.hasNext, isLoading]
	);

	const observerRef = useRef<IntersectionObserver | null>(null);
	if (loadMoreRef && scrollContainerRef) {
		if (observerRef.current) {
			observerRef.current.disconnect();
		}
		observerRef.current = new IntersectionObserver(handleIntersection, {
			root: scrollContainerRef,
			threshold: 0.1,
			rootMargin: "300px",
		});
		observerRef.current.observe(loadMoreRef);
	}

	// Accumulate events as they load
	const prevEventsRef = useRef<RecentCustomEvent[]>([]);
	if (events?.length && events !== prevEventsRef.current) {
		prevEventsRef.current = events;
		const existingKeys = new Set(
			allEvents.map((e) => `${e.timestamp}-${e.event_name}-${e.session_id}`)
		);
		let hasNewEvents = false;

		const newEvents = [...allEvents];
		for (const event of events) {
			const key = `${event.timestamp}-${event.event_name}-${event.session_id}`;
			if (!existingKeys.has(key)) {
				newEvents.push(event);
				hasNewEvents = true;
			}
		}

		if (hasNewEvents) {
			setAllEvents(newEvents);
		}
		setIsInitialLoad(false);
	}

	// Extract unique values for filter dropdowns
	const eventTypes = useMemo(() => {
		const types = new Set(allEvents.map((e) => e.event_name));
		return Array.from(types).sort();
	}, [allEvents]);

	const uniquePaths = useMemo(() => {
		const paths = new Set(allEvents.map((e) => e.path).filter(Boolean));
		return Array.from(paths).sort() as string[];
	}, [allEvents]);

	const uniquePropertyKeys = useMemo(() => {
		const keys = new Set<string>();
		for (const event of allEvents) {
			for (const key of Object.keys(event.properties)) {
				keys.add(key);
			}
		}
		return Array.from(keys).sort();
	}, [allEvents]);

	const propertyValues = useMemo(() => {
		if (selectedPropertyKey === "all") {
			return [];
		}

		const values = new Set<string>();
		for (const event of allEvents) {
			const val = event.properties[selectedPropertyKey];
			if (val !== undefined && val !== null) {
				values.add(String(val));
			}
		}
		return Array.from(values).sort();
	}, [allEvents, selectedPropertyKey]);

	// Apply all filters
	const filteredEvents = useMemo(() => {
		let result = allEvents;

		// Filter by event type
		if (selectedEventType !== "all") {
			result = result.filter((e) => e.event_name === selectedEventType);
		}

		// Filter by path
		if (selectedPath !== "all") {
			result = result.filter((e) => e.path === selectedPath);
		}

		// Filter by has properties
		if (hasProperties === "with") {
			result = result.filter((e) => Object.keys(e.properties).length > 0);
		} else if (hasProperties === "without") {
			result = result.filter((e) => Object.keys(e.properties).length === 0);
		}

		// Filter by property key
		if (selectedPropertyKey !== "all") {
			result = result.filter((e) => selectedPropertyKey in e.properties);

			// Filter by property value (only if key is selected)
			if (selectedPropertyValue !== "all") {
				result = result.filter(
					(e) =>
						String(e.properties[selectedPropertyKey]) === selectedPropertyValue
				);
			}
		}

		// Text search
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(e) =>
					e.event_name.toLowerCase().includes(query) ||
					e.path?.toLowerCase().includes(query) ||
					Object.values(e.properties).some((val) =>
						String(val).toLowerCase().includes(query)
					)
			);
		}

		return result;
	}, [
		allEvents,
		selectedEventType,
		selectedPath,
		hasProperties,
		selectedPropertyKey,
		selectedPropertyValue,
		searchQuery,
	]);

	// Build active filters for display
	const activeFilters = useMemo<ActiveFilter[]>(() => {
		const result: ActiveFilter[] = [];

		if (selectedEventType !== "all") {
			result.push({
				type: "event",
				label: "Event",
				value: selectedEventType,
				onRemoveAction: () => setSelectedEventType("all"),
			});
		}

		if (selectedPath !== "all") {
			result.push({
				type: "path",
				label: "Path",
				value: selectedPath,
				onRemoveAction: () => setSelectedPath("all"),
			});
		}

		if (hasProperties !== "all") {
			result.push({
				type: "hasProps",
				label: "Properties",
				value: hasProperties === "with" ? "With" : "Without",
				onRemoveAction: () => setHasProperties("all"),
			});
		}

		if (selectedPropertyKey !== "all") {
			const propLabel =
				selectedPropertyValue !== "all"
					? `${selectedPropertyKey} = ${selectedPropertyValue}`
					: selectedPropertyKey;
			result.push({
				type: "property",
				label: "Property",
				value: propLabel,
				onRemoveAction: () => {
					setSelectedPropertyKey("all");
					setSelectedPropertyValue("all");
				},
			});
		}

		return result;
	}, [
		selectedEventType,
		selectedPath,
		hasProperties,
		selectedPropertyKey,
		selectedPropertyValue,
		setSelectedEventType,
		setSelectedPath,
		setHasProperties,
		setSelectedPropertyKey,
		setSelectedPropertyValue,
	]);

	const clearAllFilters = useCallback(() => {
		setSelectedEventType("all");
		setSelectedPath("all");
		setHasProperties("all");
		setSelectedPropertyKey("all");
		setSelectedPropertyValue("all");
		setSearchQuery("");
		setSearchInput("");
	}, [
		setSelectedEventType,
		setSelectedPath,
		setHasProperties,
		setSelectedPropertyKey,
		setSelectedPropertyValue,
		setSearchQuery,
	]);

	const handleAddFilter = useCallback(
		(eventName: string) => {
			addFilter({ field: "event_name", operator: "eq", value: eventName });
		},
		[addFilter]
	);

	const handleCopyEvent = useCallback((event: RecentCustomEvent) => {
		const data = {
			event_name: event.event_name,
			path: event.path,
			timestamp: event.timestamp,
			properties: event.properties,
		};
		navigator.clipboard.writeText(JSON.stringify(data, null, 2));
	}, []);

	// Reset property value when property key changes
	const handlePropertyKeyChange = useCallback(
		(value: string) => {
			setSelectedPropertyKey(value);
			setSelectedPropertyValue("all");
		},
		[setSelectedPropertyKey, setSelectedPropertyValue]
	);

	const columns = useMemo<ColumnDef<RecentCustomEvent>[]>(
		() => [
			{
				id: "timestamp",
				header: "Time",
				accessorFn: (row) => row.timestamp,
				cell: ({ row }) => (
					<div className="flex flex-col">
						<span className="text-foreground text-sm">
							{dayjs(row.original.timestamp).fromNow()}
						</span>
						<span className="text-muted-foreground text-xs">
							{dayjs(row.original.timestamp).format("HH:mm:ss")}
						</span>
					</div>
				),
				size: 100,
			},
			{
				id: "event_name",
				header: "Event",
				accessorFn: (row) => row.event_name,
				cell: ({ row }) => (
					<div className="flex items-center gap-1.5">
						<Link
							className="group flex items-center gap-1"
							href={`/websites/${websiteId}/events/${encodeURIComponent(row.original.event_name)}`}
						>
							<span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary text-xs transition-colors group-hover:bg-primary/20">
								{row.original.event_name}
							</span>
							<ArrowSquareOutIcon className="size-3 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
						</Link>
						<button
							aria-label={`Filter by ${row.original.event_name}`}
							className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/row:opacity-100"
							onClick={() => handleAddFilter(row.original.event_name)}
							title="Filter by this event"
							type="button"
						>
							<FunnelIcon className="size-3.5" weight="duotone" />
						</button>
					</div>
				),
				size: 160,
			},
			{
				id: "path",
				header: "Page",
				accessorFn: (row) => row.path,
				cell: ({ row }) =>
					row.original.path ? (
						<button
							className="flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
							onClick={() => setSelectedPath(row.original.path)}
							title={`Filter by ${row.original.path}`}
							type="button"
						>
							<LinkIcon className="size-3.5 shrink-0" />
							<span className="max-w-[200px] truncate">
								{row.original.path}
							</span>
						</button>
					) : (
						<span className="text-muted-foreground/50 text-sm">—</span>
					),
				size: 200,
			},
			{
				id: "properties",
				header: "Properties",
				cell: ({ row }) => {
					const props = row.original.properties;
					const entries = Object.entries(props);

					if (entries.length === 0) {
						return (
							<span className="text-muted-foreground/50 text-sm">
								No properties
							</span>
						);
					}

					return (
						<div className="flex flex-wrap gap-1.5">
							{entries.slice(0, 3).map(([key, value]) => {
								const strValue = String(value);
								const isLong = strValue.length > 30;
								return (
									<button
										className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs transition-colors hover:bg-muted/80"
										key={key}
										onClick={() => {
											setSelectedPropertyKey(key);
											setSelectedPropertyValue(strValue);
										}}
										title={`Filter by ${key}: ${strValue}`}
										type="button"
									>
										<span className="text-muted-foreground">{key}:</span>
										<span className="max-w-[120px] truncate text-foreground">
											{isLong ? `${strValue.slice(0, 27)}…` : strValue}
										</span>
									</button>
								);
							})}
							{entries.length > 3 && (
								<span className="text-muted-foreground text-xs">
									+{entries.length - 3} more
								</span>
							)}
						</div>
					);
				},
				size: 300,
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<Button
						aria-label="Copy event JSON"
						className="size-7 opacity-0 transition-opacity focus:opacity-100 group-hover/row:opacity-100"
						onClick={() => handleCopyEvent(row.original)}
						size="icon"
						title="Copy event JSON"
						variant="ghost"
					>
						<CopyIcon className="size-3.5" />
					</Button>
				),
				size: 40,
			},
		],
		[
			websiteId,
			handleAddFilter,
			handleCopyEvent,
			setSelectedPath,
			setSelectedPropertyKey,
			setSelectedPropertyValue,
		]
	);

	const table = useReactTable({
		data: filteredEvents,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row, index) => `${index}-${row.timestamp}-${row.event_name}`,
	});

	if (isLoading && isInitialLoad) {
		return (
			<div className="flex h-full flex-col">
				<div className="space-y-2.5 border-b bg-muted/30 px-4 py-3">
					<div className="flex flex-wrap items-center gap-2">
						<Skeleton className="size-4 rounded" />
						<Skeleton className="h-8 w-[140px]" />
						<div className="h-5 w-px bg-border/60" />
						<Skeleton className="size-4 rounded" />
						<Skeleton className="h-8 w-[140px]" />
						<div className="h-5 w-px bg-border/60" />
						<Skeleton className="size-4 rounded" />
						<Skeleton className="h-8 w-[135px]" />
						<Skeleton className="h-8 w-[130px]" />
						<div className="h-5 w-px bg-border/60" />
						<Skeleton className="h-8 w-[160px]" />
						<div className="flex-1" />
						<Skeleton className="h-6 w-20 rounded-full" />
					</div>
				</div>
				<div className="flex-1 overflow-auto">
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
								<SkeletonRow key={`skeleton-${i}`} />
							))}
						</TableBody>
					</Table>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					description={
						error?.message || "There was an error loading the events"
					}
					icon={<LightningIcon />}
					title="Failed to load events"
					variant="error"
				/>
			</div>
		);
	}

	if (!allEvents || allEvents.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					description={
						<>
							Events will appear here once your tracker starts collecting them.
							Use{" "}
							<code className="rounded bg-muted px-1 py-0.5 text-xs">
								databuddy.track()
							</code>{" "}
							to send custom events.
						</>
					}
					icon={<LightningIcon />}
					title="No events yet"
					variant="minimal"
				/>
			</div>
		);
	}

	const hasActiveFilters = activeFilters.length > 0 || searchQuery.trim();

	return (
		<div className="flex h-full flex-col">
			<div className="space-y-2.5 border-b bg-muted/30 px-4 py-3">
				{/* Filter row */}
				<div className="flex flex-wrap items-center gap-2">
					{/* Event Type - Primary filter */}
					<div className="flex items-center gap-1.5">
						<LightningIcon
							className="size-4 text-foreground/70"
							weight="duotone"
						/>
						<Select
							onValueChange={setSelectedEventType}
							value={selectedEventType}
						>
							<SelectTrigger
								className={cn(
									"h-8 w-[140px] border-border/60 bg-background shadow-sm",
									selectedEventType !== "all" &&
										"border-primary/40 bg-primary/5 text-primary"
								)}
							>
								<SelectValue placeholder="Event type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All events</SelectItem>
								{eventTypes.map((type) => (
									<SelectItem key={type} value={type}>
										{type}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Divider */}
					<div className="h-5 w-px bg-border/60" />

					{/* Path */}
					<div className="flex items-center gap-1.5">
						<LinkIcon className="size-4 text-foreground/70" />
						<Select onValueChange={setSelectedPath} value={selectedPath}>
							<SelectTrigger
								className={cn(
									"h-8 w-[140px] border-border/60 bg-background shadow-sm",
									selectedPath !== "all" &&
										"border-primary/40 bg-primary/5 text-primary"
								)}
							>
								<SelectValue placeholder="Page" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All pages</SelectItem>
								{uniquePaths.map((path) => (
									<SelectItem key={path} value={path}>
										<span className="max-w-[200px] truncate">{path}</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Divider */}
					<div className="h-5 w-px bg-border/60" />

					{/* Properties group */}
					<div className="flex items-center gap-1.5">
						<TagIcon className="size-4 text-foreground/70" weight="duotone" />
						<Select
							onValueChange={(v) => setHasProperties(v as HasPropertiesFilter)}
							value={hasProperties}
						>
							<SelectTrigger
								className={cn(
									"h-8 w-[135px] border-border/60 bg-background shadow-sm",
									hasProperties !== "all" &&
										"border-primary/40 bg-primary/5 text-primary"
								)}
							>
								<SelectValue placeholder="Properties" />
							</SelectTrigger>
							<SelectContent>
								{hasPropertiesOptions.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{/* Property Key */}
						{uniquePropertyKeys.length > 0 && (
							<Select
								onValueChange={handlePropertyKeyChange}
								value={selectedPropertyKey}
							>
								<SelectTrigger
									className={cn(
										"h-8 w-[130px] border-border/60 bg-background shadow-sm",
										selectedPropertyKey !== "all" &&
											"border-primary/40 bg-primary/5 text-primary"
									)}
								>
									<SelectValue placeholder="Key" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Any key</SelectItem>
									{uniquePropertyKeys.map((key) => (
										<SelectItem key={key} value={key}>
											{key}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						{/* Property Value */}
						{selectedPropertyKey !== "all" && propertyValues.length > 0 && (
							<>
								<span className="text-foreground/40">=</span>
								<Select
									onValueChange={setSelectedPropertyValue}
									value={selectedPropertyValue}
								>
									<SelectTrigger
										className={cn(
											"h-8 w-[120px] border-border/60 bg-background shadow-sm",
											selectedPropertyValue !== "all" &&
												"border-primary/40 bg-primary/5 text-primary"
										)}
									>
										<SelectValue placeholder="Value" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">Any value</SelectItem>
										{propertyValues.map((val) => (
											<SelectItem key={val} value={val}>
												<span className="max-w-[160px] truncate">{val}</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</>
						)}
					</div>

					{/* Divider */}
					<div className="h-5 w-px bg-border/60" />

					{/* Search */}
					<div className="relative">
						<MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-foreground/50" />
						<Input
							className={cn(
								"h-8 w-[160px] border-border/60 bg-background pl-8 text-sm shadow-sm",
								searchQuery.trim() &&
									"border-primary/40 bg-primary/5 text-primary"
							)}
							onChange={(e) => handleSearchInputChange(e.target.value)}
							placeholder="Search…"
							value={searchInput}
						/>
					</div>

					{/* Spacer */}
					<div className="flex-1" />

					{/* Results count */}
					<div className="flex items-center gap-3">
						<span className="rounded-full bg-foreground/5 px-2.5 py-1 font-medium text-foreground text-xs tabular-nums">
							{filteredEvents.length.toLocaleString()} event
							{filteredEvents.length !== 1 ? "s" : ""}
						</span>

						{/* Clear all */}
						{hasActiveFilters && (
							<Button
								className="h-7 gap-1 px-2 text-xs"
								onClick={clearAllFilters}
								size="sm"
								variant="outline"
							>
								<XIcon className="size-3" />
								Clear
							</Button>
						)}
					</div>
				</div>

				{/* Active filters chips */}
				{activeFilters.length > 0 && <ActiveFilters filters={activeFilters} />}
			</div>

			<div className="min-h-0 flex-1 overflow-auto" ref={setScrollContainerRef}>
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-accent backdrop-blur-sm">
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								className="bg-accent shadow-[0_0_0_0.5px_var(--border)]"
								key={headerGroup.id}
							>
								{headerGroup.headers.map((header) => (
									<TableHead
										className="h-[39px]"
										key={header.id}
										style={{ width: header.column.getSize() }}
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
						{filteredEvents.length === 0 ? (
							<TableRow>
								<TableCell
									className="h-32 text-center text-muted-foreground"
									colSpan={columns.length}
								>
									No events match your filters
								</TableCell>
							</TableRow>
						) : (
							table.getRowModel().rows.map((row) => (
								<TableRow
									className={cn(
										"group/row h-[65px] transition-colors hover:bg-muted/30"
									)}
									key={row.id}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											className="py-2"
											key={cell.id}
											style={{ width: cell.column.getSize() }}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
								</TableRow>
							))
						)}

						{pagination.hasNext && filteredEvents.length > 0 && (
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
	);
}
