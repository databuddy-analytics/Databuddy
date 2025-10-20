'use client';

import { DatabaseIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { EmptyState } from '@/components/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExtensionCard } from './extension-card';

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

interface ExtensionTabsProps {
	installedExtensions: Extension[];
	availableExtensions: Extension[];
	searchTerm: string;
	canManage: boolean;

	// Actions
	onInstall?: (extension: Extension) => void;
	onUpdate?: (extension: Extension) => void;
	onRemove?: (extension: Extension) => void;
	onReset?: (extension: Extension) => void;
	onInstallExtension?: () => void;
	onClearSearch?: () => void;

	// Loading states
	loadingStates?: {
		installing?: string;
		updating?: string;
		removing?: string;
		resetting?: string;
	};
}

export function ExtensionTabs({
	installedExtensions,
	availableExtensions,
	searchTerm,
	canManage,
	onInstall,
	onUpdate,
	onRemove,
	onReset,
	onInstallExtension,
	onClearSearch,
	loadingStates = {},
}: ExtensionTabsProps) {
	const hasSearchTerm = searchTerm.trim().length > 0;

	return (
		<Tabs className="space-y-4" defaultValue="installed">
			<div className="relative border-b">
				<TabsList className="h-10 w-full justify-start overflow-x-auto bg-transparent p-0">
					<TabsTrigger
						className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:h-[2px] data-[state=active]:after:w-full data-[state=active]:after:bg-primary data-[state=active]:after:content-[''] sm:px-4 sm:text-sm"
						value="installed"
					>
						Installed ({installedExtensions.length})
					</TabsTrigger>
					<TabsTrigger
						className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-0 data-[state=active]:after:h-[2px] data-[state=active]:after:w-full data-[state=active]:after:bg-primary data-[state=active]:after:content-[''] sm:px-4 sm:text-sm"
						value="available"
					>
						Available ({availableExtensions.length})
					</TabsTrigger>
				</TabsList>
			</div>

			<TabsContent
				className="animate-fadeIn space-y-4 transition-all duration-200"
				value="installed"
			>
				{installedExtensions.length === 0 ? (
					hasSearchTerm ? (
						<EmptyState
							action={
								onClearSearch
									? {
											label: 'Clear Search',
											onClick: onClearSearch,
											variant: 'outline',
										}
									: undefined
							}
							description={
								searchTerm
									? `No extensions match "${searchTerm}". Try adjusting your search terms.`
									: 'No extensions match your search criteria.'
							}
							icon={
								<MagnifyingGlassIcon
									className="h-12 w-12 text-muted-foreground"
									size={16}
									weight="duotone"
								/>
							}
							showPlusBadge={false}
							title="No Extensions Found"
							variant="simple"
						/>
					) : (
						<EmptyState
							action={
								canManage && onInstallExtension
									? {
											label: 'Install Extension',
											onClick: onInstallExtension,
										}
									: undefined
							}
							description="Get started by installing your first PostgreSQL extension to enhance your database capabilities."
							icon={
								<DatabaseIcon
									className="h-12 w-12 text-muted-foreground"
									size={16}
									weight="duotone"
								/>
							}
							showPlusBadge={false}
							title="No Extensions Installed"
							variant="simple"
						/>
					)
				) : (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{installedExtensions.map((ext) => (
							<ExtensionCard
								canManage={canManage}
								extension={ext}
								isRemoving={loadingStates.removing === ext.name}
								isResetting={loadingStates.resetting === ext.name}
								isUpdating={loadingStates.updating === ext.name}
								key={ext.name}
								onRemove={() => onRemove?.(ext)}
								onReset={() => onReset?.(ext)}
								onUpdate={() => onUpdate?.(ext)}
								type="installed"
							/>
						))}
					</div>
				)}
			</TabsContent>

			<TabsContent
				className="animate-fadeIn space-y-4 transition-all duration-200"
				value="available"
			>
				{availableExtensions.length === 0 ? (
					hasSearchTerm ? (
						<EmptyState
							action={
								onClearSearch
									? {
											label: 'Clear Search',
											onClick: onClearSearch,
											variant: 'outline',
										}
									: undefined
							}
							description={
								searchTerm
									? `No extensions match "${searchTerm}". Try adjusting your search terms.`
									: 'No extensions match your search criteria.'
							}
							icon={
								<MagnifyingGlassIcon
									className="h-12 w-12 text-muted-foreground"
									size={16}
									weight="duotone"
								/>
							}
							showPlusBadge={false}
							title="No Extensions Found"
							variant="simple"
						/>
					) : (
						<EmptyState
							action={undefined}
							description="All available extensions have been installed or there are no extensions available for installation."
							icon={
								<DatabaseIcon
									className="h-12 w-12 text-muted-foreground"
									size={16}
									weight="duotone"
								/>
							}
							showPlusBadge={false}
							title="No Available Extensions"
							variant="simple"
						/>
					)
				) : (
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{availableExtensions.map((ext) => (
							<ExtensionCard
								canManage={canManage}
								extension={ext}
								isInstalling={loadingStates.installing === ext.name}
								key={ext.name}
								onInstall={() => onInstall?.(ext)}
								type="available"
							/>
						))}
					</div>
				)}
			</TabsContent>
		</Tabs>
	);
}
