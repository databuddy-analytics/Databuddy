'use client';

import { PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';
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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useOrganizations } from '@/hooks/use-organizations';

interface CreateConnectionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: {
		name: string;
		type?: string;
		url: string;
		organizationId?: string;
	}) => void;
	isLoading: boolean;
}

export function CreateConnectionDialog({
	open,
	onOpenChange,
	onSubmit,
	isLoading,
}: CreateConnectionDialogProps) {
	const [name, setName] = useState('');
	const [type, setType] = useState('postgres');
	const [url, setUrl] = useState('');

	const { activeOrganization } = useOrganizations();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!(name.trim() && url.trim())) {
			return;
		}

		onSubmit({
			name: name.trim(),
			type,
			url: url.trim(),
			organizationId: activeOrganization?.id,
		});
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!newOpen) {
			// Reset form when closing
			setName('');
			setType('postgres');
			setUrl('');
		}
		onOpenChange(newOpen);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add Database Connection</DialogTitle>
					<DialogDescription>
						Connect to your database to monitor performance metrics.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="name">Connection Name</Label>
						<Input
							id="name"
							onChange={(e) => setName(e.target.value)}
							placeholder="Production DB"
							required
							value={name}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="type">Database Type</Label>
						<Select onValueChange={setType} value={type}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectLabel>Available</SelectLabel>
									<SelectItem value="postgres">PostgreSQL</SelectItem>
								</SelectGroup>
								<SelectGroup>
									<SelectLabel>Coming soon</SelectLabel>
									<SelectItem disabled value="mysql">
										MySQL
									</SelectItem>
									<SelectItem disabled value="sqlite">
										SQLite
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="url">Connection URL</Label>
						<Input
							id="url"
							onChange={(e) => setUrl(e.target.value)}
							placeholder="postgres://user:pass@host:5432/db"
							required
							type="url"
							value={url}
						/>
						<p className="text-muted-foreground text-xs">
							Connection string will be encrypted and stored securely
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
						<Button
							disabled={isLoading || !name.trim() || !url.trim()}
							type="submit"
						>
							{isLoading ? (
								'Adding...'
							) : (
								<>
									<PlusIcon className="h-4 w-4" />
									Add Connection
								</>
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
