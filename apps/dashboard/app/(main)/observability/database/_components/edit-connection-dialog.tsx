'use client';

import { PencilSimpleIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import type { DbConnection } from '@/hooks/use-db-connections';

interface EditConnectionDialogProps {
	connection: DbConnection;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: { id: string; name: string }) => void;
	isLoading: boolean;
}

export function EditConnectionDialog({
	connection,
	open,
	onOpenChange,
	onSubmit,
	isLoading,
}: EditConnectionDialogProps) {
	const [name, setName] = useState('');

	useEffect(() => {
		if (connection) {
			setName(connection.name);
		} else {
			setName('');
		}
	}, [connection]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!(connection && name.trim())) {
			return;
		}

		onSubmit({
			id: connection.id,
			name: name.trim(),
		});
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			setName('');
		}
		onOpenChange(newOpen);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit Database Connection</DialogTitle>
					<DialogDescription>
						Update the name of your database connection.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="edit-name">Connection Name</Label>
						<Input
							id="edit-name"
							onChange={(e) => setName(e.target.value)}
							placeholder="Production DB"
							required
							value={name}
						/>
					</div>

					<div className="space-y-2">
						<Label>Database Type</Label>
						<div className="rounded bg-muted px-3 py-2 text-muted-foreground text-sm">
							{connection?.type || 'postgres'}
						</div>
						<p className="text-muted-foreground text-xs">
							Database type cannot be changed after creation
						</p>
					</div>

					<div className="space-y-2">
						<Label>Connection URL</Label>
						<div className="rounded bg-muted px-3 py-2 text-muted-foreground text-sm">
							•••••••••••••••••••••••••
						</div>
						<p className="text-muted-foreground text-xs">
							Connection URL cannot be changed. Delete and recreate if needed.
						</p>
					</div>

					<DialogFooter>
						<Button
							disabled={isLoading}
							onClick={() => handleOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={isLoading || !name.trim()} type="submit">
							{isLoading ? (
								'Updating...'
							) : (
								<>
									<PencilSimpleIcon className="h-4 w-4" />
									Update Connection
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
