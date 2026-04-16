"use client";

import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { nanoid } from "nanoid";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Organization, useOrganizations } from "@/hooks/use-organizations";
import { getOrganizationInitials } from "@/lib/utils";

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
				onError: () => {
					toast.error("Failed to update avatar");
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
					<Avatar className="size-10">
						<AvatarImage alt={organization.name} src={avatarUrl} />
						<AvatarFallback className="bg-accent font-medium text-sm">
							{getOrganizationInitials(organization.name)}
						</AvatarFallback>
					</Avatar>
					<button
						aria-label="Edit organization avatar"
						className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-foreground opacity-0 transition-opacity group-hover:opacity-100"
						onClick={() => setIsModalOpen(true)}
						type="button"
					>
						<PencilSimpleIcon className="text-accent" size={16} />
					</button>
				</div>
				<div className="space-y-1">
					<p className="font-medium text-foreground text-sm">
						Organization avatar
					</p>
					<p className="text-muted-foreground text-xs">
						Click to customize your avatar.
					</p>
				</div>
			</div>

			<Dialog onOpenChange={handleOpenChange} open={isModalOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Customize avatar</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col items-center gap-4 py-4">
						<Avatar className="size-24">
							<AvatarImage alt="Avatar preview" src={previewUrl} />
							<AvatarFallback className="bg-accent font-medium text-lg">
								{getOrganizationInitials(organization.name)}
							</AvatarFallback>
						</Avatar>
						<div className="w-full space-y-2">
							<Label htmlFor="seed">Avatar seed</Label>
							<div className="flex gap-2">
								<Input
									id="seed"
									onChange={(e) => setSeed(e.target.value)}
									placeholder="Enter a seed…"
									value={seed}
								/>
								<Button
									onClick={handleRandomize}
									size="icon"
									type="button"
									variant="outline"
								>
									<ArrowsClockwiseIcon size={16} />
								</Button>
							</div>
							<p className="text-muted-foreground text-xs">
								Change the seed to generate a different avatar.
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button onClick={() => setIsModalOpen(false)} variant="outline">
							Cancel
						</Button>
						<Button disabled={isUpdatingAvatarSeed} onClick={handleSave}>
							{isUpdatingAvatarSeed ? (
								<>
									<div className="mr-2 size-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
									Saving...
								</>
							) : (
								"Save"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
