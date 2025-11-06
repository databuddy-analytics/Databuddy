"use client";

import type { AppRouter } from "@databuddy/rpc";
import { ChartBarIcon, TrendDownIcon, UsersIcon } from "@phosphor-icons/react";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { UseTRPCQueryResult } from "@trpc/react-query/shared";
import { useMemo, useState } from "react";
import { ReferrerSourceCell } from "@/components/atomic/ReferrerSourceCell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { FunnelAnalyticsByReferrerResult } from "@/hooks/use-funnels";

interface Props {
	websiteId: string;
	funnelId: string;
	dateRange: { start_date: string; end_date: string };
	onReferrerChange?: (referrer: string) => void;
	data: UseTRPCQueryResult<
		{ referrer_analytics: FunnelAnalyticsByReferrerResult[] },
		TRPCClientErrorLike<AppRouter>
	>["data"];
	isLoading: boolean;
	error: TRPCClientErrorLike<AppRouter> | null;
}

export default function FunnelAnalyticsByReferrer({
	onReferrerChange,
	data,
	isLoading,
	error,
}: Props) {
	const [selectedReferrer, setSelectedReferrer] = useState("all");

	const handleChange = (referrer: string) => {
		setSelectedReferrer(referrer);
		onReferrerChange?.(referrer);
	};

	const referrers = useMemo(() => {
		if (!data?.referrer_analytics) {
			return [];
		}
		const grouped = new Map<
			string,
			{
				label: string;
				parsed: FunnelAnalyticsByReferrerResult["referrer_parsed"];
				users: number;
			}
		>();
		for (const r of data.referrer_analytics) {
			const domain = r.referrer_parsed?.domain?.toLowerCase() || "direct";
			const label = r.referrer_parsed?.name || domain || "Direct";
			if (!grouped.has(domain)) {
				grouped.set(domain, { label, parsed: r.referrer_parsed, users: 0 });
			}
			const group = grouped.get(domain);
			if (group) {
				group.users += r.total_users;
			}
		}
		return Array.from(grouped, ([value, { label, parsed, users }]) => ({
			value,
			label,
			parsed,
			users,
		})).sort((a, b) => b.users - a.users);
	}, [data]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-between">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-8 w-48" />
			</div>
		);
	}

	if (error) {
		return (
			<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
				<CardContent className="pt-6">
					<div className="flex items-center gap-2">
						<TrendDownIcon
							className="h-5 w-5 text-red-600"
							size={16}
							weight="duotone"
						/>
						<p className="font-medium text-red-600">
							Error loading referrer data
						</p>
					</div>
					<p className="mt-2 text-red-600/80 text-sm">{error.message}</p>
				</CardContent>
			</Card>
		);
	}

	if (!data?.referrer_analytics?.length) {
		return (
			<Card className="rounded border-dashed">
				<CardContent className="pt-6">
					<div className="py-8 text-center">
						<UsersIcon
							className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
							size={24}
							weight="duotone"
						/>
						<p className="font-medium text-muted-foreground">
							No referrer data available
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	const totalUsers =
		data?.referrer_analytics?.reduce(
			(sum: number, r: FunnelAnalyticsByReferrerResult) => sum + r.total_users,
			0
		) || 0;

	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<ChartBarIcon
					className="h-4 w-4 text-primary"
					size={16}
					weight="duotone"
				/>
				<span className="font-medium text-foreground text-sm">
					Traffic Source
				</span>
			</div>
			<Select onValueChange={handleChange} value={selectedReferrer}>
				<SelectTrigger className="w-64 rounded">
					<SelectValue placeholder="Select traffic source" />
				</SelectTrigger>
				<SelectContent className="rounded">
					<SelectItem value="all">
						<div className="flex items-center gap-2">
							<ChartBarIcon
								className="h-3.5 w-3.5"
								size={14}
								weight="duotone"
							/>
							<span>All Sources</span>
							<Badge className="ml-auto text-xs" variant="outline">
								{totalUsers} users
							</Badge>
						</div>
					</SelectItem>
					{referrers.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							<div className="flex w-full items-center gap-2">
								<ReferrerSourceCell
									className="flex-shrink-0"
									domain={option.parsed?.domain || ""}
									name={option.label}
									referrer={option.value}
								/>
								<Badge className="ml-auto text-xs" variant="outline">
									{option.users} users
								</Badge>
							</div>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
