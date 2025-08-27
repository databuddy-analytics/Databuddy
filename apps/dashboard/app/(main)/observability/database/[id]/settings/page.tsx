'use client';

import {
	CheckIcon,
	DatabaseIcon,
	GearIcon,
	KeyIcon,
	PencilIcon,
	ShieldCheckIcon,
	ShieldWarningIcon,
	TrashIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import { use, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc';

interface ConnectionSettingsPageProps {
	params: Promise<{ id: string }>;
}

function LoadingState() {
	return (
		<>
			<div className="space-y-2">
				<div className="h-8 w-64 animate-pulse rounded bg-muted" />
				<div className="h-4 w-96 animate-pulse rounded bg-muted" />
			</div>
			<div className="grid gap-6">
				{Array.from({ length: 3 }).map((_, i) => (
					<Card key={i.toString()}>
						<CardHeader>
							<div className="h-6 w-48 animate-pulse rounded bg-muted" />
							<div className="h-4 w-72 animate-pulse rounded bg-muted" />
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								<div className="h-4 w-full animate-pulse rounded bg-muted" />
								<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

function EditConnectionDialog({
	open,
	onOpenChange,
	connection,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connection: { id: string; name: string } | null;
	onSuccess: () => void;
}) {
	const [name, setName] = useState(connection?.name || '');

	const updateMutation = trpc.dbConnections.update.useMutation({
		onSuccess: () => {
			onSuccess();
			onOpenChange(false);
		},
	});

	const handleSave = () => {
		if (!(connection && name.trim())) {
			return;
		}
		updateMutation.mutate({
			id: connection.id,
			name: name.trim(),
		});
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Connection</DialogTitle>
					<DialogDescription>
						Update the name and basic settings for this database connection.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label htmlFor="connection-name">Connection Name</Label>
						<Input
							id="connection-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="Enter connection name"
							value={name}
						/>
					</div>
					{updateMutation.error && (
						<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
							<WarningIcon className="h-4 w-4 text-red-600" />
							<AlertDescription className="text-red-800 dark:text-red-200">
								{updateMutation.error.message}
							</AlertDescription>
						</Alert>
					)}
				</div>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={!name.trim() || updateMutation.isPending}
						onClick={handleSave}
					>
						{updateMutation.isPending ? 'Saving...' : 'Save Changes'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function UpgradeConnectionDialog({
	open,
	onOpenChange,
	connectionId,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connectionId: string;
	onSuccess: () => void;
}) {
	const [adminUrl, setAdminUrl] = useState('');

	const upgradeMutation = trpc.dbConnections.updateUrl.useMutation({
		onSuccess: () => {
			onSuccess();
			onOpenChange(false);
			setAdminUrl('');
		},
	});

	const handleUpgrade = () => {
		if (!adminUrl) {
			return;
		}
		upgradeMutation.mutate({
			id: connectionId,
			adminUrl,
			permissionLevel: 'admin',
		});
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Upgrade to Admin Access</DialogTitle>
					<DialogDescription>
						Provide an admin connection URL to enable full database management
						capabilities.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label htmlFor="admin-url">Admin Database URL</Label>
						<Input
							id="admin-url"
							onChange={(e) => setAdminUrl(e.target.value)}
							placeholder="postgresql://admin:password@host:5432/database"
							type="password"
							value={adminUrl}
						/>
						<p className="mt-1 text-muted-foreground text-xs">
							This will create a new admin user and replace your current
							connection.
						</p>
					</div>
					{upgradeMutation.error && (
						<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
							<WarningIcon className="h-4 w-4 text-red-600" />
							<AlertDescription className="text-red-800 dark:text-red-200">
								{upgradeMutation.error.message}
							</AlertDescription>
						</Alert>
					)}
				</div>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={!adminUrl || upgradeMutation.isPending}
						onClick={handleUpgrade}
					>
						{upgradeMutation.isPending ? 'Upgrading...' : 'Upgrade'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteConnectionDialog({
	open,
	onOpenChange,
	connection,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connection: { id: string; name: string } | null;
	onSuccess: () => void;
}) {
	const [confirmName, setConfirmName] = useState('');

	const deleteMutation = trpc.dbConnections.delete.useMutation({
		onSuccess: () => {
			onSuccess();
			onOpenChange(false);
		},
	});

	const handleDelete = () => {
		if (!connection || confirmName !== connection.name) {
			return;
		}
		deleteMutation.mutate({ id: connection.id });
	};

	const isConfirmed = confirmName === connection?.name;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete Connection</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete the
						connection and remove all associated monitoring data.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
						<WarningIcon className="h-4 w-4 text-red-600" />
						<AlertDescription className="text-red-800 dark:text-red-200">
							<strong>Warning:</strong> This will permanently delete all
							monitoring data, performance metrics, and configuration for this
							connection.
						</AlertDescription>
					</Alert>
					<div>
						<Label htmlFor="confirm-name">
							Type <strong>{connection?.name}</strong> to confirm
						</Label>
						<Input
							id="confirm-name"
							onChange={(e) => setConfirmName(e.target.value)}
							placeholder={connection?.name || ''}
							value={confirmName}
						/>
					</div>
					{deleteMutation.error && (
						<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
							<WarningIcon className="h-4 w-4 text-red-600" />
							<AlertDescription className="text-red-800 dark:text-red-200">
								{deleteMutation.error.message}
							</AlertDescription>
						</Alert>
					)}
				</div>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={!isConfirmed || deleteMutation.isPending}
						onClick={handleDelete}
						variant="destructive"
					>
						{deleteMutation.isPending ? 'Deleting...' : 'Delete Connection'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function ConnectionSettingsPage({
	params,
}: ConnectionSettingsPageProps) {
	const [editDialog, setEditDialog] = useState(false);
	const [upgradeDialog, setUpgradeDialog] = useState(false);
	const [deleteDialog, setDeleteDialog] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);

	const resolvedParams = use(params);
	const connectionId = resolvedParams.id;

	const utils = trpc.useUtils();

	const { data: connection, isLoading } = trpc.dbConnections.getById.useQuery({
		id: connectionId,
	});

	const handleSuccess = (message: string) => {
		utils.dbConnections.getById.invalidate({ id: connectionId });
		setSuccess(message);
		setTimeout(() => setSuccess(null), 5000);
	};

	const handleDeleteSuccess = () => {
		window.location.href = '/observability/database';
	};

	if (isLoading) {
		return <LoadingState />;
	}

	if (!connection) {
		return (
			<Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
				<WarningIcon className="h-4 w-4 text-red-600" />
				<AlertDescription className="text-red-800 dark:text-red-200">
					Connection not found or you don't have permission to access it.
				</AlertDescription>
			</Alert>
		);
	}

	const isAdmin = connection.permissionLevel === 'admin';

	return (
		<>
			{/* Header */}
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<GearIcon
						className="h-6 w-6 text-muted-foreground"
						weight="duotone"
					/>
					<h1 className="font-bold text-2xl">Connection Settings</h1>
				</div>
				<p className="text-muted-foreground text-sm">
					Manage your database connection configuration and permissions
				</p>
			</div>

			{/* Success Banner */}
			{success && (
				<Alert className="items-center border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
					<CheckIcon className="h-4 w-4 text-green-600" />
					<AlertDescription className="flex items-center justify-between">
						<span className="text-green-800 dark:text-green-200">
							{success}
						</span>
						<Button onClick={() => setSuccess(null)} size="sm" variant="ghost">
							Dismiss
						</Button>
					</AlertDescription>
				</Alert>
			)}

			{/* Basic Information */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<DatabaseIcon className="h-5 w-5" />
								Basic Information
							</CardTitle>
							<CardDescription>
								Basic details about your database connection
							</CardDescription>
						</div>
						<Button
							onClick={() => setEditDialog(true)}
							size="sm"
							variant="outline"
						>
							<PencilIcon className="h-4 w-4" />
							Edit
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<Label className="font-medium text-sm">Connection Name</Label>
							<p className="text-muted-foreground text-sm">{connection.name}</p>
						</div>
						<div>
							<Label className="font-medium text-sm">Created</Label>
							<p className="text-muted-foreground text-sm">
								{new Date(connection.createdAt).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</p>
						</div>
						<div>
							<Label className="font-medium text-sm">Last Updated</Label>
							<p className="text-muted-foreground text-sm">
								{new Date(connection.updatedAt).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Permission Management */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<KeyIcon className="h-5 w-5" />
						Permission Level
					</CardTitle>
					<CardDescription>
						Manage database access permissions and capabilities
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								{isAdmin ? (
									<>
										<ShieldCheckIcon className="h-4 w-4 text-green-600" />
										<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
											Admin Access
										</Badge>
									</>
								) : (
									<>
										<ShieldWarningIcon className="h-4 w-4 text-amber-600" />
										<Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
											Read-Only Access
										</Badge>
									</>
								)}
							</div>
							<p className="text-muted-foreground text-sm">
								{isAdmin
									? 'Full database management capabilities including extension installation and configuration changes'
									: 'Limited to monitoring and read-only operations. Upgrade to admin for full management capabilities'}
							</p>
						</div>
						{!isAdmin && (
							<Button onClick={() => setUpgradeDialog(true)} variant="outline">
								Upgrade to Admin
							</Button>
						)}
					</div>

					{isAdmin && (
						<Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
							<CheckIcon className="h-4 w-4 text-green-600" />
							<AlertDescription className="text-green-800 dark:text-green-200">
								<strong>Admin capabilities enabled:</strong>
								<ul className="mt-2 list-inside list-disc space-y-1 text-sm">
									<li>Install and manage PostgreSQL extensions</li>
									<li>Modify database configuration</li>
									<li>Create and manage database users</li>
									<li>Full monitoring and performance analysis</li>
								</ul>
							</AlertDescription>
						</Alert>
					)}
				</CardContent>
			</Card>

			{/* Connection Details */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DatabaseIcon className="h-5 w-5" />
						Connection Details
					</CardTitle>
					<CardDescription>
						Technical details and connection information
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<Label className="font-medium text-sm">Connection ID</Label>
							<p className="break-all font-mono text-muted-foreground text-sm">
								{connection.id}
							</p>
						</div>
						<div>
							<Label className="font-medium text-sm">Organization</Label>
							<p className="text-muted-foreground text-sm">
								{connection.organizationId
									? 'Organization Account'
									: 'Personal Account'}
							</p>
						</div>
						<div>
							<Label className="font-medium text-sm">User ID</Label>
							<p className="break-all font-mono text-muted-foreground text-sm">
								{connection.userId}
							</p>
						</div>
						<div>
							<Label className="font-medium text-sm">Database Type</Label>
							<div className="flex items-center gap-2">
								<Badge className="capitalize" variant="outline">
									{connection.type}
								</Badge>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Monitoring Configuration */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheckIcon className="h-5 w-5" />
						Monitoring & Access
					</CardTitle>
					<CardDescription>
						Current monitoring capabilities based on your permission level
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-3">
						<div className="flex items-center justify-between rounded border p-3">
							<div className="space-y-1">
								<p className="font-medium text-sm">Performance Monitoring</p>
								<p className="text-muted-foreground text-xs">
									Track query performance, connection pools, and database
									metrics
								</p>
							</div>
							<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
								Enabled
							</Badge>
						</div>
						<div className="flex items-center justify-between rounded border p-3">
							<div className="space-y-1">
								<p className="font-medium text-sm">Query Analysis</p>
								<p className="text-muted-foreground text-xs">
									Analyze slow queries and execution plans
								</p>
							</div>
							<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
								Enabled
							</Badge>
						</div>
						<div className="flex items-center justify-between rounded border p-3">
							<div className="space-y-1">
								<p className="font-medium text-sm">Extension Management</p>
								<p className="text-muted-foreground text-xs">
									Install and manage PostgreSQL extensions
								</p>
							</div>
							{isAdmin ? (
								<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
									Enabled
								</Badge>
							) : (
								<Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
									Requires Admin
								</Badge>
							)}
						</div>
						<div className="flex items-center justify-between rounded border p-3">
							<div className="space-y-1">
								<p className="font-medium text-sm">Configuration Changes</p>
								<p className="text-muted-foreground text-xs">
									Modify database settings and parameters
								</p>
							</div>
							{isAdmin ? (
								<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
									Enabled
								</Badge>
							) : (
								<Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
									Requires Admin
								</Badge>
							)}
						</div>
					</div>
				</CardContent>
			</Card>

			<Separator />

			{/* Danger Zone */}
			<Card className="border-red-200 dark:border-red-800">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-red-600">
						<WarningIcon className="h-5 w-5" />
						Danger Zone
					</CardTitle>
					<CardDescription>
						Irreversible and destructive actions for this connection
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between rounded border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
						<div>
							<h4 className="font-medium text-red-800 dark:text-red-200">
								Delete Connection
							</h4>
							<p className="text-red-700 text-sm dark:text-red-300">
								Permanently delete this connection and all associated monitoring
								data
							</p>
						</div>
						<Button
							onClick={() => setDeleteDialog(true)}
							size="sm"
							variant="destructive"
						>
							<TrashIcon className="mr-2 h-4 w-4" />
							Delete
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Dialogs */}
			<EditConnectionDialog
				connection={connection}
				onOpenChange={setEditDialog}
				onSuccess={() => handleSuccess('Connection updated successfully')}
				open={editDialog}
			/>

			<UpgradeConnectionDialog
				connectionId={connectionId}
				onOpenChange={setUpgradeDialog}
				onSuccess={() =>
					handleSuccess('Connection upgraded to admin successfully')
				}
				open={upgradeDialog}
			/>

			<DeleteConnectionDialog
				connection={connection}
				onOpenChange={setDeleteDialog}
				onSuccess={handleDeleteSuccess}
				open={deleteDialog}
			/>
		</>
	);
}
