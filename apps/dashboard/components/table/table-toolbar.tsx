import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ds/button";
import { Card } from "@/components/ds/card";
import { SectionBrandOverlay } from "@/components/logo/section-brand-overlay";

interface TableToolbarProps {
	borderBottom?: boolean;
	description?: string;
	onFullScreenToggle?: () => void;
	showBrand?: boolean;
	showFullScreen?: boolean;
	title: string;
}

export function TableToolbar({
	title,
	description,
	showFullScreen = true,
	onFullScreenToggle,
	showBrand = false,
}: TableToolbarProps) {
	return (
		<Card.Header className="flex-row items-center justify-between gap-3 py-3">
			<div className="min-w-0 flex-1">
				<Card.Title className="truncate text-sm">{title}</Card.Title>
				{description && (
					<Card.Description className="line-clamp-2 text-pretty">
						{description}
					</Card.Description>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{showBrand ? <SectionBrandOverlay layout="inline" /> : null}
				{showFullScreen && onFullScreenToggle && (
					<Button
						aria-label="Full screen"
						className="size-7"
						onClick={onFullScreenToggle}
						size="icon"
						title="Full screen"
						type="button"
						variant="ghost"
					>
						<ArrowsOutSimpleIcon className="size-4" />
					</Button>
				)}
			</div>
		</Card.Header>
	);
}
