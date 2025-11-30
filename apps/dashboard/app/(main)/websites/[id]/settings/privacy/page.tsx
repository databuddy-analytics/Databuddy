"use client";

import {
	CheckIcon,
	ClipboardIcon,
	InfoIcon,
	ShareIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	updateWebsiteCache,
	useWebsite,
	type Website,
} from "@/hooks/use-websites";
import { orpc } from "@/lib/orpc";
import { NoticeBanner } from "../../../_components/notice-banner";

export default function PrivacyPage() {
	const params = useParams();
	const websiteId = params.id as string;
	const { data: websiteData } = useWebsite(websiteId);
	const queryClient = useQueryClient();

	const toggleMutation = useMutation({
		...orpc.websites.togglePublic.mutationOptions(),
		onSuccess: (updatedWebsite: Website) => {
			updateWebsiteCache(queryClient, updatedWebsite);
		},
	});

	const isPublic = websiteData?.isPublic ?? false;
	const shareableLink = websiteData
		? `${window.location.origin}/demo/${websiteId}`
		: "";

	const handleTogglePublic = useCallback(() => {
		if (!websiteData) {
			return;
		}

		toast.promise(
			toggleMutation.mutateAsync({ id: websiteId, isPublic: !isPublic }),
			{
				loading: "Updating privacy settings...",
				success: "Privacy settings updated successfully",
				error: "Failed to update privacy settings",
			}
		);
	}, [websiteData, websiteId, isPublic, toggleMutation]);

	const handleCopyLink = useCallback(() => {
		if (!shareableLink) {
			return;
		}
		navigator.clipboard.writeText(shareableLink);
		toast.success("Link copied to clipboard!");
	}, [shareableLink]);

	if (!websiteData) {
		return (
			<div className="flex h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				badgeContent={isPublic ? "Public" : "Private"}
				badgeVariant={isPublic ? "blue" : "secondary"}
				description="Control public access to your website's analytics dashboard"
				icon={<ShareIcon />}
				title="Privacy"
			/>
			<div className="flex min-h-0 flex-1 flex-col">
				<section className="border-b px-4 py-5 sm:px-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<p className="font-medium text-sm">Enable public sharing</p>
							<p className="text-muted-foreground text-xs">
								Anyone with the link can view your analytics data in read-only
								mode.
							</p>
							{isPublic && (
								<Badge className="mt-3" variant="blue">
									<CheckIcon className="size-3" size={12} weight="bold" />
									Public access enabled
								</Badge>
							)}
						</div>
						<Switch
							aria-label="Toggle public access"
							checked={isPublic}
							className="data-[state=checked]:bg-primary"
							id="public-toggle"
							onCheckedChange={handleTogglePublic}
						/>
					</div>
				</section>

				{isPublic && (
					<section className="border-b px-4 py-5 sm:px-6">
						<div className="mb-3 flex items-center gap-2">
							<h2 className="font-semibold text-sm">
								Shareable Dashboard Link
							</h2>
							<Badge className="text-xs" variant="gray">
								Read-only
							</Badge>
						</div>

						<div className="space-y-3">
							<div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
								<code className="flex flex-1 items-center justify-between overflow-x-auto break-all rounded-md border bg-card px-3 py-2 font-mono text-sm">
									{shareableLink}
									<Button
										aria-label="Copy shareable link"
										className="shrink-0"
										onClick={handleCopyLink}
										size="sm"
										variant="ghost"
									>
										<ClipboardIcon className="h-4 w-4" />
									</Button>
								</code>
							</div>
							<NoticeBanner
								description="This link provides secure, view-only access to your analytics dashboard. Shared users can explore data but cannot modify settings or delete the website."
								icon={<InfoIcon />}
							/>
						</div>
					</section>
				)}
			</div>
		</div>
	);
}
