'use client';

import type { DbConnection } from '@/hooks/use-db-connections';
import { ConnectionCard } from './connection-card';
import { EmptyState } from './empty-state';

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
		return <EmptyState onCreateConnection={onCreate} />;
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
