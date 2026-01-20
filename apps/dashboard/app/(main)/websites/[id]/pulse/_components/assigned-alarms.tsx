"use client";

import { BellIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationsContext } from "@/contexts/organizations-context";
import { orpc } from "@/lib/orpc";

interface AssignedAlarmsProps {
	websiteId: string;
}

export function AssignedAlarms({ websiteId }: AssignedAlarmsProps) {
	const { activeOrganization } = useOrganizationsContext();

	const { data: alarms, isLoading } = useQuery({
		...orpc.alarms.list.queryOptions({
			input: {
				organizationId: activeOrganization?.id || "",
				websiteId,
			},
		}),
		enabled: !!activeOrganization?.id && !!websiteId,
	});

	const uptimeAlarms = alarms?.filter(
		(alarm) => alarm.triggerType === "uptime" && alarm.enabled
	);

	if (isLoading) {
		return (
			<div className="border-b bg-sidebar">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<h3 className="font-semibold text-lg text-sidebar-foreground">
						Alarms
					</h3>
					<Skeleton className="h-8 w-24" />
				</div>
				<div className="p-4">
					<Skeleton className="h-16 w-full" />
				</div>
			</div>
		);
	}

	return (
		<div className="border-b bg-sidebar">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<h3 className="font-semibold text-lg text-sidebar-foreground">
					Alarms
				</h3>
				<Link href={`/settings/notifications?websiteId=${websiteId}`}>
					<Button size="sm" variant="outline">
						<PlusIcon className="mr-1 size-4" />
						Manage Alarms
					</Button>
				</Link>
			</div>

			<div className="p-4">
				{!uptimeAlarms || uptimeAlarms.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
						<BellIcon className="mb-2 size-8 text-muted-foreground" weight="duotone" />
						<p className="mb-1 font-medium text-sm">No alarms configured</p>
						<p className="mb-3 text-muted-foreground text-xs">
							Set up alarms to get notified when your site goes down
						</p>
						<Link href={`/settings/notifications?websiteId=${websiteId}`}>
							<Button size="sm" variant="outline">
								<PlusIcon className="mr-1 size-3" />
								Create Alarm
							</Button>
						</Link>
					</div>
				) : (
					<div className="space-y-2">
						{uptimeAlarms.map((alarm) => (
							<div
								key={alarm.id}
								className="flex items-center justify-between rounded-lg border bg-card p-3"
							>
								<div className="flex items-center gap-3">
									<div className="flex size-8 shrink-0 items-center justify-center rounded bg-emerald-500/10">
										<BellIcon className="size-4 text-emerald-600" weight="duotone" />
									</div>
									<div>
										<p className="font-medium text-sm">{alarm.name}</p>
										{alarm.description && (
											<p className="text-muted-foreground text-xs">
												{alarm.description}
											</p>
										)}
									</div>
								</div>
								<div className="flex items-center gap-2">
									{alarm.notificationChannels.map((channel) => (
										<Badge key={channel} variant="secondary">
											{channel}
										</Badge>
									))}
								</div>
							</div>
						))}
						<div className="pt-2 text-center">
							<Link href={`/settings/notifications?websiteId=${websiteId}`}>
								<Button size="sm" variant="ghost">
									View all alarms
								</Button>
							</Link>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

