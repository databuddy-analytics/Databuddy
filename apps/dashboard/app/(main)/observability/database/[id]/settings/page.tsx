'use client';

import {
	CheckIcon,
	DatabaseIcon,
	GearIcon,
	PencilIcon,
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
import {
	useDbConnection,
	useDeleteDbConnection,
	useUpdateDbConnection,
} from '@/hooks/use-db-connections';
import { trpc } from '@/lib/trpc';
import { EditConnectionDialog } from '../../_components/edit-connection-dialog';

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
		</>
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

	const deleteMutation = useDeleteDbConnection({
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

	const [deleteDialog, setDeleteDialog] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);

	const resolvedParams = use(params);
	const connectionId = resolvedParams.id;

	const utils = trpc.useUtils();

	const { data: connection, isLoading } = useDbConnection(connectionId);

	const updateMutation = useUpdateDbConnection({
		onSuccess: () => {
			handleSuccess('Connection updated successfully');
			setEditDialog(false);
		},
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
						<DatabaseIcon className="h-5 w-5" />
						Monitoring & Access
					</CardTitle>
					<CardDescription>
						Database monitoring and access capabilities
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
							<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
								Enabled
							</Badge>
						</div>
						<div className="flex items-center justify-between rounded border p-3">
							<div className="space-y-1">
								<p className="font-medium text-sm">Configuration Changes</p>
								<p className="text-muted-foreground text-xs">
									Modify database settings and parameters
								</p>
							</div>
							<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
								Enabled
							</Badge>
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
				isLoading={updateMutation.isPending}
				onOpenChange={setEditDialog}
				onSubmit={(data) => {
					updateMutation.mutate(data);
				}}
				open={editDialog}
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
