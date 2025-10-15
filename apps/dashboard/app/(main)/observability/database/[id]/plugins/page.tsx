'use client';

import {
	ArrowClockwiseIcon,
	CheckIcon,
	DatabaseIcon,
	GearIcon,
	PlusIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { use, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDbConnection } from '@/hooks/use-db-connections';
import { trpc } from '@/lib/trpc';
import { ExtensionSearch, ExtensionStats, ExtensionTabs } from './_components';

interface ExtensionsPageProps {
	params: Promise<{ id: string }>;
}

function LoadingState() {
	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background to-muted/20 px-6 py-6">
				<div className="flex items-center gap-4">
					<div className="rounded border border-primary/20 bg-primary/10 p-3">
						<DatabaseIcon className="h-6 w-6 text-primary" weight="duotone" />
					</div>
					<div className="flex-1">
						<Skeleton className="h-8 w-64" />
						<Skeleton className="mt-2 h-4 w-96" />
					</div>
					<Skeleton className="h-10 w-32" />
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col space-y-6 p-6">
				{/* Stats skeleton */}
				<ExtensionStats
					isLoading={true}
					stats={{ installed: 0, available: 0, updates: 0 }}
				/>

				{/* Content skeleton */}
				<div className="space-y-4">
					<Skeleton className="h-10 w-full max-w-md" />
					<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 6 }).map((_, i) => (
							<Skeleton className="h-48 w-full rounded" key={i.toString()} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

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

function InstallDialog({
	open,
	onOpenChange,
	availableExtensions,
	onInstall,
	isLoading,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	availableExtensions: Extension[];
	onInstall: (name: string, schema?: string) => void;
	isLoading: boolean;
}) {
	const [selectedExtension, setSelectedExtension] = useState('');
	const [schema, setSchema] = useState('public');

	const selectedExt = availableExtensions.find(
		(ext) => ext.name === selectedExtension
	);

	const handleInstall = () => {
		if (!selectedExtension) {
			return;
		}
		onInstall(selectedExtension, schema);
		setSelectedExtension('');
	};

	const handleClose = () => {
		onOpenChange(false);
		setSelectedExtension('');
		setSchema('public');
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<PlusIcon className="h-5 w-5 text-primary" />
						Install Extension
					</DialogTitle>
					<DialogDescription>
						Select an extension to install. All installations include safety
						checks and can be safely rolled back.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					<div className="space-y-2">
						<Label htmlFor="extension-select">Extension</Label>
						<Select
							onValueChange={setSelectedExtension}
							value={selectedExtension}
						>
							<SelectTrigger className="rounded-lg" id="extension-select">
								<SelectValue placeholder="Choose an extension to install" />
							</SelectTrigger>
							<SelectContent>
								{availableExtensions.map((ext) => (
									<SelectItem key={ext.name} value={ext.name}>
										<div className="flex flex-col items-start">
											<span className="font-medium">{ext.name}</span>
											<span className="text-muted-foreground text-xs">
												{ext.description}
											</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedExt && (
						<div className="rounded-lg border bg-muted/20 p-4">
							<h4 className="mb-2 font-medium text-sm">Extension Details</h4>
							<div className="space-y-1 text-sm">
								<div>
									<span className="text-muted-foreground">Version:</span>{' '}
									{selectedExt.defaultVersion}
								</div>
								{selectedExt.requiresRestart && (
									<div className="text-amber-600">
										<span className="text-muted-foreground">Note:</span>{' '}
										Requires server restart
									</div>
								)}
							</div>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="schema-input">Schema</Label>
						<Input
							className="rounded-lg"
							id="schema-input"
							onChange={(e) => setSchema(e.target.value)}
							placeholder="public"
							value={schema}
						/>
						<p className="text-muted-foreground text-xs">
							The database schema where the extension will be installed
						</p>
					</div>
				</div>

				<DialogFooter className="gap-2">
					<Button onClick={handleClose} variant="outline">
						Cancel
					</Button>
					<Button
						className="gap-2"
						disabled={!selectedExtension || isLoading}
						onClick={handleInstall}
					>
						{isLoading ? (
							<>
								<ArrowClockwiseIcon className="h-4 w-4 animate-spin" />
								Installing...
							</>
						) : (
							<>
								<PlusIcon className="h-4 w-4" />
								Install Extension
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ConfigurationRequiredDialog({
	open,
	onOpenChange,
	extensionName,
	warnings,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	extensionName: string;
	warnings: string[];
}) {
	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<GearIcon className="h-5 w-5" />
						Configuration Required
					</DialogTitle>
					<DialogDescription>
						{extensionName} requires PostgreSQL server configuration changes.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
						<WarningIcon className="h-4 w-4 text-muted-foreground" />
						<AlertDescription className="text-muted-foreground">
							<p className="font-medium text-sm">
								Server Configuration Required
							</p>
							<p className="mt-1 text-xs">{warnings[0]}</p>
						</AlertDescription>
					</Alert>

					<div className="space-y-3">
						<h4 className="font-medium text-sm">Quick Setup:</h4>

						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 font-medium text-blue-800 text-xs dark:bg-blue-900/20 dark:text-blue-400">
									1
								</div>
								<span className="font-medium text-sm">
									Edit postgresql.conf
								</span>
							</div>
							<div className="ml-7">
								<div className="relative">
									<pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
										<code>{`shared_preload_libraries = '${extensionName}'`}</code>
									</pre>
									<Button
										className="absolute top-1 right-1"
										onClick={() =>
											copyToClipboard(
												`shared_preload_libraries = '${extensionName}'`
											)
										}
										size="sm"
										variant="ghost"
									>
										Copy
									</Button>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 font-medium text-blue-800 text-xs dark:bg-blue-900/20 dark:text-blue-400">
									2
								</div>
								<span className="font-medium text-sm">Restart PostgreSQL</span>
							</div>
							<div className="ml-7">
								<div className="relative">
									<pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
										<code>sudo systemctl restart postgresql</code>
									</pre>
									<Button
										className="absolute top-1 right-1"
										onClick={() =>
											copyToClipboard('sudo systemctl restart postgresql')
										}
										size="sm"
										variant="ghost"
									>
										Copy
									</Button>
								</div>
							</div>
						</div>

						<div className="flex items-center gap-2">
							<div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 font-medium text-blue-800 text-xs dark:bg-blue-900/20 dark:text-blue-400">
								3
							</div>
							<span className="font-medium text-sm">Try installing again</span>
						</div>
					</div>

					<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
						<WarningIcon className="h-4 w-4 text-amber-600" />
						<AlertDescription className="text-amber-800 text-xs dark:text-amber-200">
							<strong>Note:</strong> Requires server admin access and will
							restart PostgreSQL.
						</AlertDescription>
					</Alert>
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Later
					</Button>
					<Button onClick={() => onOpenChange(false)}>Done</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function RemoveExtensionDialog({
	open,
	onOpenChange,
	extensionName,
	warnings,
	isLoading,
	onRemove,
	forceCascade,
	onForceCascadeChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	extensionName: string | null;
	warnings: string[];
	isLoading: boolean;
	onRemove: (extensionName: string, cascade: boolean) => void;
	forceCascade: boolean;
	onForceCascadeChange: (checked: boolean) => void;
}) {
	const handleRemove = () => {
		if (!extensionName) {
			return;
		}
		onRemove(extensionName, forceCascade);
	};

	const handleClose = () => {
		onOpenChange(false);
		onForceCascadeChange(false);
	};

	return (
		<Dialog onOpenChange={handleClose} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Extension</DialogTitle>
					<DialogDescription>
						Are you sure you want to remove <strong>{extensionName}</strong>?
						This action cannot be undone.
					</DialogDescription>
				</DialogHeader>

				{warnings.length > 0 && (
					<div className="space-y-4">
						<Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
							<WarningIcon className="h-4 w-4 text-amber-600" />
							<AlertDescription>
								<div className="space-y-2">
									<p className="font-medium text-amber-800 dark:text-amber-200">
										Dependencies Found
									</p>
									<ul className="list-inside list-disc space-y-1 text-amber-700 text-sm dark:text-amber-300">
										{warnings.map((warning) => (
											<li key={warning}>{warning}</li>
										))}
									</ul>
								</div>
							</AlertDescription>
						</Alert>

						<div className="flex items-center space-x-2">
							<Checkbox
								checked={forceCascade}
								id="force-cascade"
								onCheckedChange={onForceCascadeChange}
							/>
							<Label
								className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								htmlFor="force-cascade"
							>
								Force removal (CASCADE) - This will also remove dependent
								objects
							</Label>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button onClick={handleClose} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={isLoading || (warnings.length > 0 && !forceCascade)}
						onClick={handleRemove}
						variant="destructive"
					>
						{isLoading ? 'Removing...' : 'Remove'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function ExtensionsPage({ params }: ExtensionsPageProps) {
	const [search, setSearch] = useState('');
	const [installDialog, setInstallDialog] = useState(false);
	const [removeDialog, setRemoveDialog] = useState<string | null>(null);
	const [removeWarnings, setRemoveWarnings] = useState<string[]>([]);
	const [forceCascade, setForceCascade] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [configDialog, setConfigDialog] = useState<{
		open: boolean;
		extensionName: string;
		warnings: string[];
	}>({ open: false, extensionName: '', warnings: [] });

	const resolvedParams = use(params);
	const connectionId = resolvedParams.id;

	const utils = trpc.useUtils();

	const { data: connection } = useDbConnection(connectionId);
	const { data: extensions } = trpc.dbConnections.getExtensions.useQuery({
		id: connectionId,
	});
	const { data: availableExtensions } =
		trpc.dbConnections.getAvailableExtensions.useQuery({
			id: connectionId,
		});

	// Mutations
	const installMutation = trpc.dbConnections.installExtension.useMutation({
		onSuccess: (result, variables) => {
			if (result?.success !== false) {
				// Successful installation
				utils.dbConnections.getExtensions.invalidate({ id: connectionId });
				utils.dbConnections.getAvailableExtensions.invalidate({
					id: connectionId,
				});
				setInstallDialog(false);
				setError(null);
				setSuccess(
					`Extension "${variables.extensionName}" installed successfully`
				);
				setTimeout(() => setSuccess(null), 5000);
			} else if (result.warnings) {
				// Check if this is a configuration-required extension
				const isConfigRequired = result.warnings.some(
					(warning) =>
						warning.includes('shared_preload_libraries') ||
						warning.includes('restart')
				);

				if (isConfigRequired) {
					setConfigDialog({
						open: true,
						extensionName: variables.extensionName,
						warnings: result.warnings,
					});
					setInstallDialog(false);
				} else {
					setError(`Cannot install extension: ${result.warnings.join(', ')}`);
				}
				setSuccess(null);
			}
		},
		onError: (err) => {
			console.error('Failed to install extension:', err);
			setError(`Failed to install extension: ${err.message}`);
			setSuccess(null);
		},
	});

	const updateMutation = trpc.dbConnections.updateExtension.useMutation({
		onSuccess: () => {
			utils.dbConnections.getExtensions.invalidate({ id: connectionId });
			setError(null);
		},
		onError: (err) => {
			console.error('Failed to update extension:', err);
			setError(`Failed to update extension: ${err.message}`);
		},
	});

	const removeMutation = trpc.dbConnections.dropExtension.useMutation({
		onSuccess: (result, variables) => {
			if (result.success) {
				utils.dbConnections.getExtensions.invalidate({ id: connectionId });
				utils.dbConnections.getAvailableExtensions.invalidate({
					id: connectionId,
				});
				setRemoveDialog(null);
				setRemoveWarnings([]);
				setForceCascade(false);
				setError(null);
				setSuccess(
					`Extension "${variables.extensionName}" removed successfully`
				);
				setTimeout(() => setSuccess(null), 5000);
			} else if (result.warnings) {
				// Handle dependency warnings
				setRemoveWarnings(result.warnings);
				setError(null);
				setSuccess(null);
			}
		},
		onError: (err) => {
			console.error('Failed to remove extension:', err);
			setError(`Failed to remove extension: ${err.message}`);
			setRemoveWarnings([]);
			setSuccess(null);
		},
	});

	const resetMutation = trpc.dbConnections.resetExtensionStats.useMutation({
		onSuccess: () => {
			utils.dbConnections.getExtensions.invalidate({ id: connectionId });
			setError(null);
		},
		onError: (err) => {
			console.error('Failed to reset extension stats:', err);
			setError(`Failed to reset extension stats: ${err.message}`);
		},
	});

	if (!(connection && extensions && availableExtensions)) {
		return <LoadingState />;
	}

	const filteredInstalled = extensions.filter(
		(ext) =>
			ext.name.toLowerCase().includes(search.toLowerCase()) ||
			ext.description.toLowerCase().includes(search.toLowerCase())
	);
	const filteredAvailable = availableExtensions.filter(
		(ext) =>
			ext.name.toLowerCase().includes(search.toLowerCase()) ||
			ext.description.toLowerCase().includes(search.toLowerCase())
	);

	const stats = {
		installed: extensions.length,
		available: availableExtensions.length,
		updates: extensions.filter((ext) => ext.needsUpdate).length,
	};

	const handleInstall = (name: string, schema?: string) => {
		installMutation.mutate({
			id: connectionId,
			extensionName: name,
			schema,
		});
	};

	const handleRemove = (extensionName: string, cascade = false) => {
		removeMutation.mutate({
			id: connectionId,
			extensionName,
			cascade,
		});
	};

	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background to-muted/20 px-6 py-6">
				<div className="flex items-center gap-4">
					<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
						<DatabaseIcon className="h-6 w-6 text-primary" weight="duotone" />
					</div>
					<div className="flex-1">
						<h1 className="font-bold text-2xl tracking-tight">
							PostgreSQL Extensions
						</h1>
						<p className="text-muted-foreground text-sm">
							Manage database extensions with production-safe operations
						</p>
					</div>
					<Button onClick={() => setInstallDialog(true)} variant="outline">
						<PlusIcon className="mr-2 h-4 w-4" />
						Install Extension
					</Button>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col space-y-6 p-6">
				{/* Success Banner */}
				{success && (
					<Alert className="items-center border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
						<CheckIcon className="h-4 w-4" color="green" />
						<AlertDescription className="flex items-center justify-between">
							<span className="text-green-800 dark:text-green-200">
								{success}
							</span>
							<Button
								onClick={() => setSuccess(null)}
								size="sm"
								variant="ghost"
							>
								Dismiss
							</Button>
						</AlertDescription>
					</Alert>
				)}

				{/* Error Banner */}
				{error && (
					<Alert className="items-center border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
						<WarningIcon className="h-4 w-4" color="red" />
						<AlertDescription className="flex items-center justify-between">
							<span className="text-red-800 dark:text-red-200">{error}</span>
							<Button onClick={() => setError(null)} size="sm" variant="ghost">
								Dismiss
							</Button>
						</AlertDescription>
					</Alert>
				)}

				{/* Stats */}
				<ExtensionStats stats={stats} />

				{/* Search */}
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<ExtensionSearch
						onSearchChange={setSearch}
						placeholder="Search extensions by name or description..."
						search={search}
					/>
				</div>

				{/* Extensions Tabs */}
				<ExtensionTabs
					availableExtensions={filteredAvailable}
					canManage={true}
					installedExtensions={filteredInstalled}
					loadingStates={{
						installing: installMutation.isPending
							? installMutation.variables?.extensionName
							: undefined,
						updating: updateMutation.isPending
							? updateMutation.variables?.extensionName
							: undefined,
						removing: removeMutation.isPending
							? removeMutation.variables?.extensionName
							: undefined,
						resetting: resetMutation.isPending
							? resetMutation.variables?.extensionName
							: undefined,
					}}
					onClearSearch={() => setSearch('')}
					onInstall={(ext) => handleInstall(ext.name)}
					onInstallExtension={() => setInstallDialog(true)}
					onRemove={(ext) => setRemoveDialog(ext.name)}
					onReset={(ext) =>
						resetMutation.mutate({
							id: connectionId,
							extensionName: ext.name,
						})
					}
					onUpdate={(ext) =>
						updateMutation.mutate({
							id: connectionId,
							extensionName: ext.name,
						})
					}
					searchTerm={search}
				/>

				{/* Dialogs */}
				<InstallDialog
					availableExtensions={availableExtensions}
					isLoading={installMutation.isPending}
					onInstall={handleInstall}
					onOpenChange={setInstallDialog}
					open={installDialog}
				/>

				{/* Configuration Required Dialog */}
				<ConfigurationRequiredDialog
					extensionName={configDialog.extensionName}
					onOpenChange={(open) => {
						if (!open) {
							setConfigDialog({ open: false, extensionName: '', warnings: [] });
						}
					}}
					open={configDialog.open}
					warnings={configDialog.warnings}
				/>

				{/* Remove Extension Dialog */}
				<RemoveExtensionDialog
					extensionName={removeDialog}
					forceCascade={forceCascade}
					isLoading={removeMutation.isPending}
					onForceCascadeChange={setForceCascade}
					onOpenChange={(open) => {
						if (!open) {
							setRemoveDialog(null);
							setRemoveWarnings([]);
							setForceCascade(false);
						}
					}}
					onRemove={handleRemove}
					open={!!removeDialog}
					warnings={removeWarnings}
				/>
			</div>
		</div>
	);
}
