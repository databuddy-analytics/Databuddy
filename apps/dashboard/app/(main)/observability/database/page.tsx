'use client';

import { DatabaseIcon, InfoIcon, TrendDownIcon } from '@phosphor-icons/react';
import { Suspense, useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { useOrganizations } from '@/hooks/use-organizations';
import { trpc } from '@/lib/trpc';
import { ConnectionsList } from './_components/connections-list';
import { CreateConnectionDialog } from './_components/create-connection-dialog';
import { DatabasePageHeader } from './_components/database-page-header';
import { DeleteConnectionDialog } from './_components/delete-connection-dialog';
import { EditConnectionDialog } from './_components/edit-connection-dialog';

const DatabaseConnectionsSkeleton = () => (
	<div className="space-y-3">
		{[...new Array(3)].map((_, i) => (
			<Card
				className="animate-pulse rounded"
				key={`connection-skeleton-${i + 1}`}
			>
				<div className="p-6">
					<div className="mb-4 flex items-start justify-between">
						<div className="flex-1 space-y-3">
							<div className="flex items-center gap-3">
								<div className="h-6 w-48 rounded bg-muted" />
								<div className="h-4 w-4 rounded bg-muted" />
							</div>
							<div className="flex items-center gap-3">
								<div className="h-5 w-16 rounded-full bg-muted" />
								<div className="h-4 w-20 rounded bg-muted" />
							</div>
						</div>
						<div className="h-8 w-8 rounded bg-muted" />
					</div>
				</div>
			</Card>
		))}
	</div>
);

interface DatabaseConnection {
	id: string;
	name: string;
	type: string;
	userId: string;
	organizationId?: string;
	createdAt: string;
	updatedAt: string;
}

export default function DatabasePage() {
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [connectionToEdit, setConnectionToEdit] =
		useState<DatabaseConnection | null>(null);
	const [connectionToDelete, setConnectionToDelete] =
		useState<DatabaseConnection | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);

	// Intersection observer for lazy loading
	const pageRef = useRef<HTMLDivElement>(null);

	// Organization context
	const { activeOrganization } = useOrganizations();

	const utils = trpc.useUtils();

	// Query for database connections
	const {
		data: connections = [],
		isLoading,
		error,
		refetch,
	} = trpc.dbConnections.list.useQuery({
		organizationId: activeOrganization?.id,
	});

	// Mutations
	const createMutation = trpc.dbConnections.create.useMutation({
		onSuccess: () => {
			utils.dbConnections.list.invalidate({
				organizationId: activeOrganization?.id,
			});
			toast.success('Database connection created successfully');
			setIsCreateDialogOpen(false);
		},
		onError: (err) => {
			toast.error(err.message || 'Failed to create database connection');
		},
	});

	const editMutation = trpc.dbConnections.update.useMutation({
		onSuccess: () => {
			utils.dbConnections.list.invalidate({
				organizationId: activeOrganization?.id,
			});
			toast.success('Database connection updated successfully');
			setConnectionToEdit(null);
		},
		onError: (err) => {
			toast.error(err.message || 'Failed to update database connection');
		},
	});

	const deleteMutation = trpc.dbConnections.delete.useMutation({
		onSuccess: () => {
			utils.dbConnections.list.invalidate({
				organizationId: activeOrganization?.id,
			});
			toast.success('Database connection deleted successfully');
			setConnectionToDelete(null);
		},
		onError: (err) => {
			toast.error(err.message || 'Failed to delete database connection');
		},
	});

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await refetch();
		} catch (err) {
			console.error('Failed to refresh database connections:', err);
		} finally {
			setIsRefreshing(false);
		}
	}, [refetch]);

	const handleCreateConnection = useCallback(() => {
		setIsCreateDialogOpen(true);
	}, []);

	const handleEditConnection = useCallback((connection: DatabaseConnection) => {
		setConnectionToEdit(connection);
	}, []);

	const handleDeleteConnection = useCallback(
		(connection: DatabaseConnection) => {
			setConnectionToDelete(connection);
		},
		[]
	);

	const handleDeleteConfirm = useCallback(() => {
		if (connectionToDelete) {
			deleteMutation.mutate({ id: connectionToDelete.id });
		}
	}, [connectionToDelete, deleteMutation]);

	const handleCreateSubmit = useCallback(
		(data: {
			name: string;
			type?: string;
			url: string;
			organizationId?: string;
		}) => {
			createMutation.mutate(data);
		},
		[createMutation]
	);

	const handleEditSubmit = useCallback(
		(data: { id: string; name: string }) => {
			editMutation.mutate(data);
		},
		[editMutation]
	);

	if (error) {
		return (
			<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
				<CardContent>
					<div className="flex items-center gap-2">
						<TrendDownIcon
							className="h-5 w-5 text-red-600"
							size={16}
							weight="duotone"
						/>
						<p className="font-medium text-red-600">
							Error loading database connections
						</p>
					</div>
					<p className="mt-2 text-red-600/80 text-sm">{error.message}</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6" ref={pageRef}>
			<DatabasePageHeader
				createActionLabel="Add Connection"
				description="Monitor your database connections and performance metrics"
				hasError={!!error}
				icon={
					<DatabaseIcon
						className="h-6 w-6 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				isLoading={isLoading}
				isRefreshing={isRefreshing}
				onCreateAction={handleCreateConnection}
				onRefresh={handleRefresh}
				subtitle={
					isLoading
						? undefined
						: `${connections.length} connection${connections.length !== 1 ? 's' : ''}`
				}
				title="Database Monitoring"
			/>

			<Alert className="rounded border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
				<InfoIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
				<AlertDescription className="text-amber-800 dark:text-amber-200">
					<strong>Alpha Release - Early Access</strong>
					Database monitoring is currently in alpha and not intended for
					production use. This is an early access feature for testing and
					feedback purposes only.
				</AlertDescription>
			</Alert>

			<Suspense fallback={<DatabaseConnectionsSkeleton />}>
				<ConnectionsList
					connections={connections}
					isLoading={isLoading}
					onCreate={handleCreateConnection}
					onDelete={handleDeleteConnection}
					onEdit={handleEditConnection}
				/>
			</Suspense>

			{isCreateDialogOpen && (
				<Suspense fallback={null}>
					<CreateConnectionDialog
						isLoading={createMutation.isPending}
						onOpenChange={setIsCreateDialogOpen}
						onSubmit={handleCreateSubmit}
						open={isCreateDialogOpen}
					/>
				</Suspense>
			)}

			{!!connectionToEdit && (
				<Suspense fallback={null}>
					<EditConnectionDialog
						connection={connectionToEdit}
						isLoading={editMutation.isPending}
						onOpenChange={(open) => {
							if (!open) {
								setConnectionToEdit(null);
							}
						}}
						onSubmit={handleEditSubmit}
						open={!!connectionToEdit}
					/>
				</Suspense>
			)}

			{!!connectionToDelete && (
				<Suspense fallback={null}>
					<DeleteConnectionDialog
						connection={
							connectionToDelete
								? { id: connectionToDelete.id, name: connectionToDelete.name }
								: null
						}
						isLoading={deleteMutation.isPending}
						onConfirm={handleDeleteConfirm}
						onOpenChange={(open) => {
							if (!open) {
								setConnectionToDelete(null);
							}
						}}
					/>
				</Suspense>
			)}
		</div>
	);
}
