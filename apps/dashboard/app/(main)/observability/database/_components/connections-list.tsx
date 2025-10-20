'use client';

import { DatabaseIcon } from '@phosphor-icons/react';
import { EmptyState } from '@/components/empty-state';
import type { DbConnection } from '@/hooks/use-db-connections';
import { ConnectionCard } from './connection-card';

interface ConnectionsListProps {
	connections: DbConnection[];
	isLoading: boolean;
	onEdit: (connection: DbConnection) => void;
	onDelete: (connection: DbConnection) => void;
	onCreate: () => void;
}

export function ConnectionsList({
	connections,
	isLoading,
	onEdit,
	onDelete,
	onCreate,
}: ConnectionsListProps) {
	if (isLoading) {
		return null; // Skeleton is handled by parent
	}

	if (connections.length === 0) {
		return (
			<EmptyState
				action={{
					label: 'Create Your First Connection',
					onClick: onCreate,
				}}
				description="Connect your databases to start monitoring performance, tracking queries, and gaining insights into your database health across all environments."
				icon={
					<DatabaseIcon
						className="h-16 w-16 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				title="No connections yet"
				variant="default"
			/>
		);
	}

	return (
		<div className="space-y-3">
			{connections.map((connection) => (
				<ConnectionCard
					connection={connection}
					key={connection.id}
					onDelete={() => onDelete(connection)}
					onEdit={() => onEdit(connection)}
				/>
			))}
		</div>
	);
}
