"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface CompleteStepProps {
	onViewDashboard: () => void;
}

export function CompleteStep({ onViewDashboard }: CompleteStepProps) {
	return (
		<div className="space-y-4">
			<div className="py-6 text-center">
				<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
					<CheckCircleIcon
						className="h-8 w-8 text-green-600 dark:text-green-400"
						size={32}
						weight="fill"
					/>
				</div>
				<h3 className="mb-2 font-medium text-lg">Integration Complete!</h3>
				<p className="mb-4 text-muted-foreground">
					Your Stripe account is now connected to DataBuddy
				</p>
			</div>

			<div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
				<h4 className="mb-2 font-medium text-green-900 dark:text-green-100">
					What's Next?
				</h4>
				<ul className="space-y-1 text-green-800 text-sm dark:text-green-200">
					<li>• Revenue data will appear in the Overview tab</li>
					<li>• Analytics will be available within 24 hours</li>
					<li>• You'll receive real-time payment notifications</li>
				</ul>
			</div>

			<Button className="w-full" onClick={onViewDashboard}>
				View Revenue Dashboard
			</Button>
		</div>
	);
}
