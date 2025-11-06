"use client";

import { CopyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface TestingStepProps {
	copyToClipboard: (text: string, label: string) => void;
	onBack: () => void;
	onNext: () => void;
}

export function TestingStep({
	copyToClipboard,
	onBack,
	onNext,
}: TestingStepProps) {
	return (
		<div className="space-y-6">
			<div>
				<h3 className="mb-3 font-medium">Step 2: Test Integration</h3>
				<div className="space-y-4">
					<div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
						<h4 className="mb-2 font-medium text-green-900 dark:text-green-100">
							Test with Stripe CLI
						</h4>
						<div className="space-y-2">
							<code className="block rounded bg-green-100 p-2 font-mono text-green-800 text-sm dark:bg-green-900/30 dark:text-green-200">
								stripe payment_intents create \<br />
								&nbsp;&nbsp;--amount 2000 \<br />
								&nbsp;&nbsp;--currency usd \<br />
								&nbsp;&nbsp;--client-reference-id "sess_db_test_123" \<br />
								&nbsp;&nbsp;--metadata[user_id]="user_test_123"
							</code>
							<Button
								onClick={() =>
									copyToClipboard(
										'stripe payment_intents create --amount 2000 --currency usd --client-reference-id "sess_db_test_123" --metadata[user_id]="user_test_123"',
										"Test command"
									)
								}
								size="sm"
								variant="outline"
							>
								<CopyIcon className="mr-2 h-4 w-4" size={16} weight="duotone" />
								Copy Command
							</Button>
						</div>
					</div>

					<div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
						<h4 className="mb-2 font-medium text-foreground">
							Integration Status
						</h4>
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-sm">
								<div className="h-2 w-2 rounded-full bg-yellow-500" />
								<span>Waiting for test webhook...</span>
							</div>
							<p className="text-muted-foreground text-xs">
								Create a test payment in Stripe to verify the integration
							</p>
						</div>
					</div>
				</div>
			</div>

			<div className="flex gap-2">
				<Button onClick={onBack} variant="outline">
					Back
				</Button>
				<Button className="flex-1" onClick={onNext}>
					Complete Setup
				</Button>
			</div>
		</div>
	);
}
