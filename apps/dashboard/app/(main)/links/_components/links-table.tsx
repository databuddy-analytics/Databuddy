"use client";

import {
	AppleLogoIcon,
	AndroidLogoIcon,
	ArrowSquareOutIcon,
	DotsThreeIcon,
	CopyIcon,
	PencilSimpleIcon,
	QrCodeIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import Image from "next/image";
import type { Link } from "@/hooks/use-links";
import { useLinkStats } from "@/hooks/use-links";
import type { OrganizationMember } from "@/hooks/use-organizations";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";

const getDicebearUrl = (seed: string | undefined) =>
	`https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed || "")}`;

dayjs.extend(relativeTime);

const LINKS_BASE_URL = "https://dby.sh";

// Default date range for link clicks (last 30 days)
const getDefaultDateRange = () => ({
	start_date: dayjs().subtract(30, "day").format("YYYY-MM-DD"),
	end_date: dayjs().format("YYYY-MM-DD"),
	granularity: "daily" as const,
});

// Component to display click count for a single link
function LinkClickCount({ linkId }: { linkId: string }) {
	const dateRange = getDefaultDateRange();
	const { data: stats, isLoading } = useLinkStats(linkId, dateRange);

	if (isLoading) {
		return (
			<div className="space-y-1">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-7 w-full max-w-[160px]" />
			</div>
		);
	}

	const clicks = stats?.totalClicks ?? 0;
	const clicksByDay = stats?.clicksByDay ?? [];

	// Calculate percentage change (compare last 7 days with previous 7 days)
	const calculatePercentageChange = () => {
		if (clicksByDay.length < 14) return null;

		const last7Days = clicksByDay
			.slice(-7)
			.reduce((sum, day) => sum + (day.clicks || 0), 0);
		const previous7Days = clicksByDay
			.slice(-14, -7)
			.reduce((sum, day) => sum + (day.clicks || 0), 0);

		if (previous7Days === 0) return last7Days > 0 ? 100 : null;

		const change = ((last7Days - previous7Days) / previous7Days) * 100;
		return Math.round(change);
	};

	const percentageChange = calculatePercentageChange();

	// Prepare chart data
	const chartData = clicksByDay.map((day) => ({
		date: day.date,
		value: day.clicks || 0,
	}));

	return (
		<div className="flex h-full flex-col">
			<div className="flex flex-col space-y-0.5">
				<span className="text-muted-foreground text-xs">Clicks</span>
				{clicks === 0 ? (
					<span className="text-sm">No Data Available</span>
				) : (
					<div className="flex items-baseline gap-2">
						<span className="font-medium tabular-nums text-sm">{formatNumber(clicks)}</span>
						{percentageChange !== null && (
							<span className={`text-xs ${percentageChange >= 0 ? "text-green-600" : "text-red-600"}`}>
								{percentageChange >= 0 ? "↑" : "↓"} {Math.abs(percentageChange)}%
							</span>
						)}
					</div>
				)}
			</div>
			<div className="mt-auto h-7 w-full max-w-[160px]">
				{chartData.length > 0 ? (
					<ResponsiveContainer height="100%" width="100%">
						<AreaChart
							data={chartData}
							margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
						>
							<XAxis dataKey="date" hide />
							<YAxis domain={["dataMin", "dataMax"]} hide />
							<Area
								dataKey="value"
								fill="#3030ED"
								fillOpacity={0.05}
								stroke="#3030ED"
								strokeWidth={1}
								type="monotone"
							/>
						</AreaChart>
					</ResponsiveContainer>
				) : (
					<div className="relative h-7 w-full max-w-[160px]">
						<div className="absolute bottom-1.5 h-px w-full bg-[#50565A]" />
						<div className="absolute bottom-0 h-1.5 w-full bg-[#50565A] opacity-5" />
					</div>
				)}
			</div>
		</div>
	);
}

interface LinksTableProps {
	links: Link[];
	isLoading: boolean;
	members?: OrganizationMember[];
	onLinkClick: (link: Link) => void;
	onEditLink: (link: Link) => void;
	onDeleteLink: (linkId: string) => void;
	onShowQr: (link: Link) => void;
}

export function LinksTable({
	links,
	isLoading,
	members = [],
	onLinkClick,
	onEditLink,
	onDeleteLink,
	onShowQr,
}: LinksTableProps) {
	const getUserByCreatedBy = (createdBy: string) => {
		return members.find((member) => member.userId === createdBy)?.user;
	};

	const getInitials = (name: string | null | undefined) => {
		if (!name) return "U";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};
	const handleCopy = useCallback(
		async (e: React.MouseEvent, link: Link) => {
			e.stopPropagation();
			try {
				await navigator.clipboard.writeText(`${LINKS_BASE_URL}/${link.slug}`);
				toast.success("Link copied to clipboard");
			} catch {
				toast.error("Failed to copy link");
			}
		},
		[]
	);

	const formatTargetUrl = (url: string): string => {
		try {
			const parsed = new URL(url);
			const display =
				parsed.host +
				(parsed.pathname !== "/" ? parsed.pathname : "") +
				parsed.search;
			return display;
		} catch {
			return url;
		}
	};

	const formatExpiration = (expiresAt: Date | string | null | undefined): string => {
		if (!expiresAt) {
			return "Never";
		}
		const now = dayjs();
		const expiry = dayjs(expiresAt);
		const diffDays = expiry.diff(now, "day");
		const diffHours = expiry.diff(now, "hour");
		const diffMinutes = expiry.diff(now, "minute");

		if (diffDays > 0) {
			return `Expires in ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
		}
		if (diffHours > 0) {
			return `Expires in ${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
		}
		if (diffMinutes > 0) {
			return `Expires in ${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`;
		}
		return "Expired";
	};

	const getDeviceTargeting = (link: Link) => {
		const devices: string[] = [];
		if (link.iosUrl) devices.push("ios");
		if (link.androidUrl) devices.push("android");
		return devices;
	};

	if (isLoading) {
		return (
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-[50px]"></TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Device Targeting</TableHead>
						<TableHead>Link Expiration</TableHead>
						<TableHead>Data</TableHead>
						<TableHead>Created by</TableHead>
						<TableHead className="w-[50px]"></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{[1, 2, 3, 4, 5].map((i) => (
						<TableRow key={i}>
							<TableCell className="pr-0">
								<div className="flex items-center justify-center">
									<Skeleton className="size-6 rounded-full" />
								</div>
							</TableCell>
							<TableCell>
								<div className="space-y-1">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-16" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-24" />
							</TableCell>
							<TableCell>
								<div className="space-y-1">
									<Skeleton className="h-4 w-20" />
									<Skeleton className="h-7 w-full max-w-[160px]" />
								</div>
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-20" />
							</TableCell>
							<TableCell>
								<Skeleton className="size-8" />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-[50px]"></TableHead>
					<TableHead>Name</TableHead>
					<TableHead>Device Targeting</TableHead>
					<TableHead>Link Expiration</TableHead>
					<TableHead>Data</TableHead>
					<TableHead>Created by</TableHead>
					<TableHead className="w-[50px]"></TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{links.map((link) => {
					const devices = getDeviceTargeting(link);
					const shortUrl = `${LINKS_BASE_URL.replace("https://", "")}/${link.slug}`;
					const targetUrl = formatTargetUrl(link.targetUrl);
					const expiration = formatExpiration(link.expiresAt);
					const creator = getUserByCreatedBy(link.createdBy);

					return (
						<TableRow
							key={link.id}
							className="cursor-pointer"
							onClick={() => onLinkClick(link)}
						>
							<TableCell className="pr-0">
								<div className="flex items-center justify-center">
									<Avatar className="size-6">
										<AvatarImage
											alt={creator?.name || "User"}
											src={creator?.image ?? undefined}
										/>
										<AvatarFallback className="bg-secondary">
											<Image
												alt={creator?.name || "User"}
												className="rounded-full"
												height={24}
												src={getDicebearUrl(link.createdBy)}
												unoptimized
												width={24}
											/>
										</AvatarFallback>
									</Avatar>
								</div>
							</TableCell>
							<TableCell>
								<div className="space-y-1">
									<div className="flex items-center gap-1">
										<span className="font-medium text-sm">{link.name}</span>
										<button
											className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-muted/80"
											onClick={(e) => {
												e.stopPropagation();
												handleCopy(e, link);
											}}
											type="button"
										>
											<span className="text-foreground">{shortUrl}</span>
											<CopyIcon className="size-3 text-muted-foreground" weight="duotone" />
										</button>
									</div>
								<div className="flex items-center gap-1 text-muted-foreground text-xs">
									<span>→</span>
									<a
										className="max-w-[380px] truncate hover:text-foreground hover:underline"
										href={link.targetUrl}
										onClick={(e) => e.stopPropagation()}
										rel="noopener noreferrer"
										target="_blank"
									>
										{targetUrl}
									</a>
									<ArrowSquareOutIcon className="size-3" />
								</div>
								</div>
							</TableCell>
							<TableCell>
								{devices.length > 0 ? (
									<div className="flex items-center gap-1.5">
										{link.iosUrl && (
											<Tooltip>
												<TooltipTrigger asChild>
													<span className="cursor-default">
														<AppleLogoIcon className="size-4 text-foreground" weight="fill" />
													</span>
												</TooltipTrigger>
												<TooltipContent>
													<p className="max-w-[300px] truncate">{link.iosUrl}</p>
												</TooltipContent>
											</Tooltip>
										)}
										{link.androidUrl && (
											<Tooltip>
												<TooltipTrigger asChild>
													<span className="cursor-default">
														<AndroidLogoIcon className="size-4 text-foreground" weight="fill" />
													</span>
												</TooltipTrigger>
												<TooltipContent>
													<p className="max-w-[300px] truncate">{link.androidUrl}</p>
												</TooltipContent>
											</Tooltip>
										)}
									</div>
								) : (
									<span className="text-muted-foreground text-sm">None</span>
								)}
							</TableCell>
							<TableCell>
								<div className="space-y-0.5">
									<span className="text-sm">{expiration}</span>
									{link.expiredRedirectUrl && (
										<div className="flex items-center gap-1 text-muted-foreground text-xs">
											<svg
												className="size-3"
												fill="none"
												height="12"
												viewBox="0 0 12 12"
												width="12"
												xmlns="http://www.w3.org/2000/svg"
											>
												<g opacity="0.7">
													<path
														d="M10.1666 6.5H3.16659C2.42992 6.5 1.83325 5.90333 1.83325 5.16667V2.5"
														stroke="currentColor"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth="1.5"
													/>
													<path
														d="M7.33325 3.66663L10.1666 6.49996L7.33325 9.33329"
														stroke="currentColor"
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth="1.5"
													/>
												</g>
											</svg>
											{link?.expiredRedirectUrl ? (
												<span className="truncate">
													{formatTargetUrl(link.expiredRedirectUrl)}
												</span>
											) : null}
										</div>
									)}
								</div>
							</TableCell>
							<TableCell className="flex h-full flex-col pb-0">
								<LinkClickCount linkId={link.id} />
							</TableCell>
							<TableCell>
								<div className="flex items-center gap-2">
									<Avatar className="size-6">
										<AvatarImage
											alt={creator?.name || "User"}
											src={creator?.image ?? undefined}
										/>
										<AvatarFallback className="bg-secondary">
											<Image
												alt={creator?.name || "User"}
												className="rounded-full"
												height={24}
												src={getDicebearUrl(link.createdBy)}
												unoptimized
												width={24}
											/>
										</AvatarFallback>
									</Avatar>
									<span className="text-muted-foreground text-sm">
										{dayjs(link.createdAt).fromNow()}
									</span>
								</div>
							</TableCell>
							<TableCell onClick={(e) => e.stopPropagation()}>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											aria-label="Link actions"
											className="size-8"
											size="icon"
											variant="ghost"
										>
											<DotsThreeIcon className="size-5" weight="bold" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-40">
										<DropdownMenuItem
											className="gap-2"
											onClick={(e) => {
												e.stopPropagation();
												handleCopy(e, link);
											}}
										>
											<CopyIcon className="size-4" weight="duotone" />
											Copy Link
										</DropdownMenuItem>
										<DropdownMenuItem
											className="gap-2"
											onClick={(e) => {
												e.stopPropagation();
												onShowQr(link);
											}}
										>
											<QrCodeIcon className="size-4" weight="duotone" />
											QR Code
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="gap-2"
											onClick={(e) => {
												e.stopPropagation();
												onEditLink(link);
											}}
										>
											<PencilSimpleIcon className="size-4" weight="duotone" />
											Edit
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="gap-2 text-destructive focus:text-destructive"
											onClick={(e) => {
												e.stopPropagation();
												onDeleteLink(link.id);
											}}
										>
											<TrashIcon className="size-4" weight="duotone" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
