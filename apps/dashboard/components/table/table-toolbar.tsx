import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { SectionBrandOverlay } from "@/components/logo/section-brand-overlay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
	borderBottom = false,
	showBrand = false,
}: TableToolbarProps) {
	return (
		<div className={cn("px-3 pt-3 pb-2", borderBottom && "border-b")}>
			<div className="flex flex-row items-start justify-between gap-3 sm:items-center">
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-semibold text-sidebar-foreground text-sm">
						{title}
					</h3>
					{description && (
						<p className="mt-0.5 line-clamp-2 text-pretty text-sidebar-foreground/70 text-xs">
							{description}
						</p>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{showBrand ? <SectionBrandOverlay layout="inline" /> : null}
					{showFullScreen && onFullScreenToggle && (
						<Button
							aria-label="Full screen"
							className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
							onClick={onFullScreenToggle}
							size="icon"
							title="Full screen"
							type="button"
							variant="ghost"
						>
							<ArrowsOutSimpleIcon className="size-4" weight="fill" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
