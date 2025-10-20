'use client';

import {
	DatabaseIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
	TrashIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DbConnection } from '@/hooks/use-db-connections';

interface ConnectionCardProps {
	connection: DbConnection;
	onEdit: () => void;
	onDelete: () => void;
}

export function ConnectionCard({
	connection,
	onEdit,
	onDelete,
}: ConnectionCardProps) {
	const router = useRouter();

	const getDatabaseIcon = (type: string) => {
		switch (type.toLowerCase()) {
			case 'postgres':
			case 'postgresql':
				return <DatabaseIcon className="text-foreground" weight="duotone" />;
			case 'mysql':
				return <DatabaseIcon className="text-orange-600" weight="duotone" />;
			case 'sqlite':
				return <DatabaseIcon className="text-gray-600" weight="duotone" />;
			default:
				return (
					<DatabaseIcon className="text-muted-foreground" weight="duotone" />
				);
		}
	};

	const handleCardClick = () => {
		router.push(`/observability/database/${connection.id}`);
	};

	const handleDropdownClick = (e: React.MouseEvent) => {
		e.stopPropagation(); // Prevent card click when dropdown is clicked
	};

	return (
		<Card
			className="cursor-pointer rounded transition-all duration-200 hover:shadow-md"
			onClick={handleCardClick}
		>
			<CardContent className="p-6">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<div className="mb-3 flex items-center gap-3">
							<h3 className="font-semibold text-lg">{connection.name}</h3>
							<div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
								{getDatabaseIcon(connection.type)}
								<span className="font-medium text-muted-foreground text-xs uppercase">
									{connection.type}
								</span>
							</div>
						</div>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-green-500" />
								<span className="text-muted-foreground text-sm">Connected</span>
							</div>
							<span className="text-muted-foreground text-sm">
								Added {new Date(connection.createdAt).toLocaleDateString()}
							</span>
						</div>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button onClick={handleDropdownClick} size="sm" variant="ghost">
								<DotsThreeIcon className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={(e) => {
									e.stopPropagation();
									onEdit();
								}}
							>
								<PencilSimpleIcon className="mr-2 h-4 w-4" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								className="text-destructive focus:text-destructive"
								onClick={(e) => {
									e.stopPropagation();
									onDelete();
								}}
							>
								<TrashIcon className="mr-2 h-4 w-4" color="red" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</CardContent>
		</Card>
	);
}
