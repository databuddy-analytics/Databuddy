import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type TableToolbarProps = {
	title: string;
	description?: string;
	showFullScreen?: boolean;
	onFullScreenToggle?: () => void;
	borderBottom?: boolean;
};

export function TableToolbar({
	title,
	description,
	showFullScreen = true,
	onFullScreenToggle,
	borderBottom = false,
}: TableToolbarProps) {
	return (
		<div className={cn("px-3 pt-3 pb-2", borderBottom && "border-b")}>
			<div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
				<div className="min-w-0 flex-1">
					<h3 className="truncate font-semibold text-sidebar-foreground text-sm">
						{title}
					</h3>
					{description && (
						<p className="mt-0.5 line-clamp-2 text-sidebar-foreground/70 text-xs">
							{description}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					{showFullScreen && onFullScreenToggle && (
						<button
							aria-label="Full screen"
							className="flex size-8 items-center justify-center rounded border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground hover:bg-accent-brighter"
							onClick={onFullScreenToggle}
							title="Full screen"
							type="button"
						>
							<ArrowsOutSimpleIcon size={16} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
