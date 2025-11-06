"use client";

import { LightningIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OverviewTabProps {
	onSetupClick: () => void;
	isSetupComplete: boolean;
	setupProgress: number;
	isLiveMode: boolean;
	websiteId?: string;
}

export function RevenueOverviewTab({
	onSetupClick,
	isSetupComplete,
}: OverviewTabProps) {
	if (!isSetupComplete) {
		return (
			<div className="rounded-lg border-2 border-dashed py-12 text-center">
				<div className="inline-block rounded-full bg-orange-100 p-3 dark:bg-orange-900/20">
					<WarningCircleIcon
						className="h-8 w-8 text-orange-500"
						size={32}
						weight="duotone"
					/>
				</div>
				<h3 className="mt-4 font-semibold text-lg">
					Stripe Integration Not Configured
				</h3>
				<p className="mt-2 text-muted-foreground text-sm">
					You need to configure your Stripe webhook to start tracking revenue.
				</p>
				<div className="mt-6">
					<Button onClick={onSetupClick}>
						<LightningIcon
							className="mr-2 h-4 w-4"
							size={16}
							weight="duotone"
						/>
						Go to Setup
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Revenue Tracking Active</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">
						Your Stripe webhook is configured and ready to track revenue across
						all your websites.
					</p>
					<div className="mt-4">
						<Badge
							className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
							variant="secondary"
						>
							✓ Active
						</Badge>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
