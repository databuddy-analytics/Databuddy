"use client";

import { type FormEvent, useState } from "react";
import { Button, Field, Input } from "@databuddy/ui";
import { Sheet } from "@databuddy/ui/client";

interface LinkFolderSheetProps {
	isCreating?: boolean;
	onCreate: (name: string) => Promise<void>;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function LinkFolderSheet({
	isCreating,
	onCreate,
	onOpenChange,
	open,
}: LinkFolderSheetProps) {
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = event.currentTarget;
		const name = new FormData(form).get("name")?.toString().trim() ?? "";

		if (!name) {
			setError("Enter a folder name.");
			return;
		}
		setError(null);
		await onCreate(name);
		form.reset();
	};

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<Sheet.Content className="w-full sm:max-w-md" side="right">
				<Sheet.Header>
					<Sheet.Title>Create Folder</Sheet.Title>
					<Sheet.Description>
						Name the folder for this organization.
					</Sheet.Description>
				</Sheet.Header>
				<form
					className="flex flex-1 flex-col overflow-hidden"
					onSubmit={handleSubmit}
				>
					<Sheet.Body>
						<Field>
							<Field.Label>Folder Name</Field.Label>
							<Input
								aria-invalid={error ? true : undefined}
								autoFocus
								name="name"
								onChange={() => setError(null)}
								placeholder="Posts"
								required
							/>
							{error ? <Field.Error>{error}</Field.Error> : null}
						</Field>
					</Sheet.Body>
					<Sheet.Footer>
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="secondary"
						>
							Cancel
						</Button>
						<Button loading={isCreating} type="submit">
							Create Folder
						</Button>
					</Sheet.Footer>
				</form>
				<Sheet.Close />
			</Sheet.Content>
		</Sheet>
	);
}
