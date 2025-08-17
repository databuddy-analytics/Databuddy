'use client';

import {
	CurrencyDollarIcon,
	PlusIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface RevenueNotSetupProps {
	websiteName?: string;
}

export function RevenueNotSetup({ websiteName }: RevenueNotSetupProps) {
	return (
		<Card className="rounded-xl border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
			<CardContent className="pt-6">
				<div className="flex flex-col items-center space-y-4 text-center">
					<div className="rounded-full border border-orange-200 bg-orange-100 p-4 dark:border-orange-800 dark:bg-orange-900/20">
						<WarningCircleIcon
							className="h-8 w-8 text-orange-500"
							size={32}
							weight="duotone"
						/>
					</div>
					<div>
						<h3 className="font-semibold text-lg text-orange-900 dark:text-orange-100">
							Revenue Tracking Not Set Up
						</h3>
						<p className="mt-2 max-w-md text-orange-700 text-sm dark:text-orange-300">
							Configure your Stripe webhook integration to start tracking
							revenue for {websiteName || 'this website'}.
						</p>
					</div>
					<Button asChild className="gap-2">
						<Link href="/revenue">
							<PlusIcon size={16} />
							Configure Revenue Tracking
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

interface NoRevenueDataProps {
	websiteName?: string;
}

export function NoRevenueData({ websiteName }: NoRevenueDataProps) {
	return (
		<Card className="rounded-xl border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
			<CardContent className="pt-6">
				<div className="flex flex-col items-center space-y-4 text-center">
					<div className="rounded-full border border-blue-200 bg-blue-100 p-4 dark:border-blue-800 dark:bg-blue-900/20">
						<CurrencyDollarIcon
							className="h-8 w-8 text-blue-500"
							size={32}
							weight="duotone"
						/>
					</div>
					<div>
						<h3 className="font-semibold text-blue-900 text-lg dark:text-blue-100">
							No Revenue Data
						</h3>
						<p className="mt-2 max-w-md text-blue-700 text-sm dark:text-blue-300">
							No revenue has been recorded for {websiteName || 'this website'}{' '}
							in the selected time period. Make sure your Stripe checkout
							includes the correct client_id and session_id.
						</p>
					</div>
					<Button asChild variant="outline">
						<a
							href="https://docs.databuddy.cc/docs/integrations/stripe"
							rel="noopener noreferrer"
							target="_blank"
						>
							View Integration Guide
						</a>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
