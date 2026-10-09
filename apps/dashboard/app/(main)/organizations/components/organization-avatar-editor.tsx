"use client";

import { ArrowsClockwiseIcon, PencilSimpleIcon } from "@databuddy/ui/icons";
import { nanoid } from "nanoid";
import { useState } from "react";
import { showErrorToast } from "@/lib/user-facing-error";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { getOrganizationInitials } from "@/lib/utils";
import { Button, Field, Input, Text } from "@databuddy/ui";
import { Avatar, Dialog } from "@databuddy/ui/client";

interface OrganizationAvatarEditorProps {
	organization: Organization;
}

function getDiceBearUrl(seed: string): string {
	return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed)}`;
}

export function OrganizationAvatarEditor({
	organization,
}: OrganizationAvatarEditorProps) {
	const { updateAvatarSeed, isUpdatingAvatarSeed } = useOrganizations();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [seed, setSeed] = useState(organization.logo || organization.id);

	const currentSeed = organization.logo || organization.id;
	const avatarUrl = getDiceBearUrl(currentSeed);
	const previewUrl = getDiceBearUrl(seed);

	const handleRandomize = () => {
		setSeed(nanoid(10));
	};

	const handleSave = () => {
		updateAvatarSeed(
			{ organizationId: organization.id, seed },
			{
				onSuccess: () => {
					setIsModalOpen(false);
				},
				onError: (error) => {
					showErrorToast(error, "Failed to update avatar");
				},
			}
		);
	};

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setSeed(currentSeed);
		}
		setIsModalOpen(open);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<div className="group relative">
					<Avatar
						alt={organization.name}
						fallback={getOrganizationInitials(organization.name)}
						size="lg"
						src={avatarUrl}
					/>
					<button
						aria-label="Edit organization avatar"
						className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-foreground opacity-0 transition-opacity group-hover:opacity-100"
						onClick={() => setIsModalOpen(true)}
						type="button"
					>
						<PencilSimpleIcon className="text-accent" size={16} />
					</button>
				</div>
				<div className="space-y-0.5">
					<Text variant="label">Organization avatar</Text>
					<Text tone="muted" variant="caption">
						Click to customize your avatar.
					</Text>
				</div>
			</div>

			<Dialog onOpenChange={handleOpenChange} open={isModalOpen}>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Customize avatar</Dialog.Title>
					</Dialog.Header>
					<Dialog.Body>
						<div className="flex flex-col items-center gap-4">
							<Avatar
								alt="Avatar preview"
								className="size-24"
								fallback={getOrganizationInitials(organization.name)}
								src={previewUrl}
							/>
							<Field className="w-full">
								<Field.Label>Avatar seed</Field.Label>
								<div className="flex gap-2">
									<Input
										onChange={(e) => setSeed(e.target.value)}
										placeholder="Enter a seed…"
										value={seed}
									/>
									<Button
										aria-label="Randomize seed"
										onClick={handleRandomize}
										size="md"
										variant="secondary"
									>
										<ArrowsClockwiseIcon size={16} />
									</Button>
								</div>
								<Field.Description>
									Change the seed to generate a different avatar.
								</Field.Description>
							</Field>
						</div>
					</Dialog.Body>
					<Dialog.Footer>
						<Button onClick={() => setIsModalOpen(false)} variant="secondary">
							Cancel
						</Button>
						<Button loading={isUpdatingAvatarSeed} onClick={handleSave}>
							{isUpdatingAvatarSeed ? "Saving…" : "Save"}
						</Button>
					</Dialog.Footer>
					<Dialog.Close />
				</Dialog.Content>
			</Dialog>
		</div>
	);
}
