"use client";

import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { EmptyState } from "@/components/empty-state";
import type { Link } from "@/hooks/use-links";
import { LinksList as LinksListComponent } from "./link-item";

interface LinksListProps {
	links: Link[];
	isLoading: boolean;
	onLinkClick: (link: Link) => void;
	onEditLink: (link: Link) => void;
	onDeleteLink: (linkId: string) => void;
	onShowQr: (link: Link) => void;
	onCreateLink: () => void;
}

export function LinksList({
	links,
	isLoading,
	onLinkClick,
	onEditLink,
	onDeleteLink,
	onShowQr,
	onCreateLink,
}: LinksListProps) {
	if (isLoading) {
		return null;
	}

	if (links.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					action={{
						label: "Create Your First Link",
						onClick: onCreateLink,
					}}
					description="Create short links to track clicks and measure engagement across your marketing campaigns."
					icon={<LinkIcon weight="duotone" />}
					title="No links yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<LinksListComponent
			links={links}
			onClick={onLinkClick}
			onDelete={onDeleteLink}
			onEdit={onEditLink}
			onShowQr={onShowQr}
		/>
	);
}
