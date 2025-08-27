'use client';

import {
	ArrowClockwiseIcon,
	CheckIcon,
	PlusIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Extension {
	name: string;
	description: string;
	version?: string;
	defaultVersion?: string;
	schema?: string;
	hasStatefulData?: boolean;
	requiresRestart?: boolean;
	needsUpdate?: boolean;
}

interface ExtensionCardProps {
	extension: Extension;
	type: 'installed' | 'available';
	onInstall?: () => void;
	onUpdate?: () => void;
	onRemove?: () => void;
	onReset?: () => void;
	canManage: boolean;
	isInstalling?: boolean;
	isUpdating?: boolean;
	isRemoving?: boolean;
	isResetting?: boolean;
}

function ExtensionBadges({
	extension,
	type,
}: {
	extension: Extension;
	type: 'installed' | 'available';
}) {
	return (
		<div className="flex flex-wrap gap-1">
			{type === 'installed' ? (
				<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
					<CheckIcon className="mr-1 h-3 w-3" />
					Installed
				</Badge>
			) : (
				<Badge variant="outline">
					<PlusIcon className="mr-1 h-3 w-3" />
					Available
				</Badge>
			)}
			{extension.needsUpdate && (
				<Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
					<ArrowClockwiseIcon className="mr-1 h-3 w-3" />
					Update Available
				</Badge>
			)}
		</div>
	);
}

function ExtensionMetadata({
	extension,
	type,
}: {
	extension: Extension;
	type: 'installed' | 'available';
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{type === 'installed' && extension.version && (
				<Badge className="text-xs" variant="secondary">
					v{extension.version}
				</Badge>
			)}
			{type === 'available' && extension.defaultVersion && (
				<Badge className="text-xs" variant="secondary">
					v{extension.defaultVersion}
				</Badge>
			)}
			{extension.schema && (
				<Badge className="text-xs" variant="outline">
					{extension.schema}
				</Badge>
			)}
			{extension.hasStatefulData && (
				<Badge className="text-xs" variant="outline">
					Stateful
				</Badge>
			)}
			{extension.requiresRestart && (
				<Badge
					className="border-amber-200 text-amber-700 text-xs dark:border-amber-800 dark:text-amber-300"
					variant="outline"
				>
					Restart Required
				</Badge>
			)}
		</div>
	);
}

export function ExtensionCard({
	extension,
	type,
	onInstall,
	onUpdate,
	onRemove,
	onReset,
	canManage,
	isInstalling,
	isUpdating,
	isRemoving,
	isResetting,
}: ExtensionCardProps) {
	const isLoading = isInstalling || isUpdating || isRemoving || isResetting;

	return (
		<Card className="group relative overflow-hidden rounded border transition-all duration-200 hover:border-primary/20 hover:shadow-lg">
			<CardContent className="py-2">
				<div className="space-y-4">
					{/* Header */}
					<div className="flex items-start justify-between">
						<div className="min-w-0 flex-1">
							<h3
								className="truncate font-semibold text-lg leading-tight"
								title={extension.name}
							>
								{extension.name}
							</h3>
							<p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
								{extension.description}
							</p>
						</div>
						<div className="ml-3 flex-shrink-0">
							<ExtensionBadges extension={extension} type={type} />
						</div>
					</div>

					{/* Metadata */}
					<ExtensionMetadata extension={extension} type={type} />

					{/* Actions */}
					<div className="flex items-center justify-between pt-2">
						<div>
							{type === 'installed' && extension.needsUpdate && onUpdate && (
								<Button
									disabled={!canManage || isLoading}
									onClick={onUpdate}
									size="sm"
									variant="outline"
								>
									<ArrowClockwiseIcon className="h-3 w-3" />
									{isUpdating ? 'Updating...' : 'Update'}
								</Button>
							)}
							{type === 'installed' && extension.hasStatefulData && onReset && (
								<Button
									disabled={!canManage || isLoading}
									onClick={onReset}
									size="sm"
									variant="outline"
								>
									{isResetting ? 'Resetting...' : 'Reset Stats'}
								</Button>
							)}
						</div>

						<div>
							{type === 'available' && onInstall && (
								<Button
									className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
									disabled={!canManage || isLoading}
									onClick={onInstall}
									size="sm"
								>
									<PlusIcon className="h-3 w-3" />
									{isInstalling ? 'Installing...' : 'Install'}
								</Button>
							)}
							{type === 'installed' && onRemove && (
								<Button
									disabled={!canManage || isLoading}
									onClick={onRemove}
									size="sm"
									variant="destructive"
								>
									<TrashIcon className="h-3 w-3" />
									{isRemoving ? 'Removing...' : 'Remove'}
								</Button>
							)}
						</div>
					</div>
				</div>
			</CardContent>

			{/* Loading overlay */}
			{isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
						<ArrowClockwiseIcon className="h-4 w-4 animate-spin" />
						Processing...
					</div>
				</div>
			)}
		</Card>
	);
}
