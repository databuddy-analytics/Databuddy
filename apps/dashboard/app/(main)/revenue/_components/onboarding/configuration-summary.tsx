'use client';

import { CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { ConfigurationSummaryProps } from '../../utils/types';

export function ConfigurationSummary({
	webhookToken,
	isLiveMode,
	webhookUrl,
}: ConfigurationSummaryProps) {
	const isConfigured = !!(webhookToken && webhookUrl);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{isConfigured ? (
						<CheckCircleIcon
							className="h-5 w-5 text-green-500"
							size={20}
							weight="fill"
						/>
					) : (
						<WarningCircleIcon
							className="h-5 w-5 text-orange-500"
							size={20}
							weight="duotone"
						/>
					)}
					Configuration Summary
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
					<div>
						<Label className="text-muted-foreground text-xs">
							Webhook Token
						</Label>
						<div className="flex items-center gap-2">
							<p className="font-mono">{webhookToken || 'Not configured'}</p>
							{webhookToken && (
								<Badge className="text-xs" variant="outline">
									Active
								</Badge>
							)}
						</div>
					</div>
					<div>
						<Label className="text-muted-foreground text-xs">Mode</Label>
						<div className="flex items-center gap-2">
							<p>{isLiveMode ? 'Production' : 'Test'}</p>
							<Badge
								className="text-xs"
								variant={isLiveMode ? 'default' : 'secondary'}
							>
								{isLiveMode ? 'Live' : 'Test'}
							</Badge>
						</div>
					</div>
					<div className="md:col-span-2">
						<Label className="text-muted-foreground text-xs">Webhook URL</Label>
						<p className="break-all font-mono text-xs">
							{webhookUrl || 'Not configured'}
						</p>
					</div>
				</div>

				{isConfigured && (
					<div className="border-t pt-2">
						<div className="flex items-center gap-2 text-green-600 text-sm dark:text-green-400">
							<CheckCircleIcon className="h-4 w-4" size={16} weight="fill" />
							<span>Integration is active and ready to receive webhooks</span>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
