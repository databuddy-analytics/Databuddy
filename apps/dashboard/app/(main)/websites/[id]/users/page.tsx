"use client";

import {
	getCountryCode,
	getCountryName,
} from "@databuddy/shared/country-codes";
import type { ProfileData } from "@databuddy/shared/types/analytics";
import { GlobeIcon, UsersIcon, UsersThreeIcon } from "@phosphor-icons/react";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { useAtom } from "jotai";

dayjs.extend(relativeTime);
dayjs.extend(utc);

import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { EmptyState } from "@/components/empty-state";
import { BrowserIcon, CountryFlag, OSIcon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useProfilesData } from "@/hooks/use-dynamic-query";
import { getDeviceIcon } from "@/lib/utils";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";
import { generateProfileName } from "./[userId]/_components/generate-profile-name";

const wwwRegex = /^www\./;

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
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const [page, setPage] = useState(1);
	const [allUsers, setAllUsers] = useState<ProfileData[]>([]);
	const [loadMoreRef, setLoadMoreRef] = useState<HTMLTableCellElement | null>(
		null
	);
	const [scrollContainerRef, setScrollContainerRef] =
		useState<HTMLDivElement | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	const { profiles, pagination, isLoading, isError, error } = useProfilesData(
		websiteId,
		dateRange,
		50,
		page,
		filters
	);

	useEffect(() => {
		setPage(1);
		setAllUsers([]);
		setIsInitialLoad(true);
	}, [dateRange, filters]);

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
	}, [profiles]);

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
							<UserAvatar size="sm" visitorId={row.original.visitor_id} />
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
				header: "Sessions",
				cell: ({ row }) => (
					<span className="font-medium tabular-nums">
						{row.original.session_count ?? 0}
					</span>
				),
				size: 70,
			},
			{
				id: "pages",
				header: "Pages",
				cell: ({ row }) => (
					<span className="font-medium tabular-nums">
						{row.original.total_events ?? 0}
					</span>
				),
				size: 60,
			},
			{
				id: "type",
				header: "Type",
				cell: ({ row }) => {
					const sessionCount = row.original.session_count ?? 0;
					const isReturning = sessionCount > 1;
					return (
						<Badge variant={isReturning ? "default" : "secondary"}>
							{isReturning ? "Return" : "New"}
						</Badge>
					);
				},
				size: 70,
			},
			{
				id: "last_visit",
				header: "Last seen",
				accessorKey: "last_visit",
				cell: ({ row }) => (
					<span className="text-muted-foreground text-sm">
						{row.original.last_visit
							? dayjs.utc(row.original.last_visit).fromNow()
							: "—"}
					</span>
				),
				size: 90,
			},
		],
		[]
	);

	const table = useReactTable({
		data: allUsers,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: (row) => row.visitor_id,
	});

	if (isLoading && isInitialLoad) {
		return (
			<div className="flex h-full flex-col">
				<PageHeader
					description="View detailed visitor profiles and activity"
					icon={<UsersThreeIcon />}
					title="Users"
				/>

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
				{/* Header */}
				<PageHeader
					description="View detailed visitor profiles and activity"
					icon={<UsersThreeIcon />}
					title="Users"
				/>

				<div className="flex min-h-0 flex-1 flex-col items-center justify-center py-24 text-center text-muted-foreground">
					<UsersIcon className="mb-4 h-12 w-12 opacity-50" />
					<p className="mb-2 font-medium text-lg">Failed to load users</p>
					<p className="text-sm">
						{error?.message || "There was an error loading the users"}
					</p>
				</div>
			</div>
		);
	}

	if (!allUsers || allUsers.length === 0) {
		return (
			<div className="flex h-full flex-col">
				{/* Header */}
				<PageHeader
					description="View detailed visitor profiles and activity"
					icon={<UsersThreeIcon />}
					title="Users"
				/>

				<EmptyState
					description="Users will appear here once visitors browse your website"
					icon={<UsersIcon />}
					title="No users found"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<PageHeader
				count={allUsers.length}
				description="View detailed visitor profiles and activity"
				icon={<UsersThreeIcon />}
				title="Users"
			/>

			{/* Content */}
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="h-full overflow-auto" ref={setScrollContainerRef}>
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
									className="h-[49px] cursor-pointer"
									key={row.id}
									onClick={() => {
										router.push(
											`/websites/${websiteId}/users/${row.original.visitor_id}`
										);
									}}
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

							{/* Load more trigger */}
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

	return (
		<div className="flex min-w-0 max-w-[100px] items-center gap-1.5">
			<FaviconImage domain={referrer} size={14} />
			<Tooltip open={isTextTruncated ? undefined : false}>
				<TooltipTrigger asChild>
					<span className="truncate text-sm" ref={checkTextOverflow}>
						{referrer}
					</span>
				</TooltipTrigger>
				<TooltipContent side="right">{referrer}</TooltipContent>
			</Tooltip>
		</div>
	);
};
