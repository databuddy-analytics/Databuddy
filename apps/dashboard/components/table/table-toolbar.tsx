import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";

interface TableToolbarProps {
	title: string;
	description?: string;
	showFullScreen?: boolean;
	onFullScreenToggle?: () => void;
}

export function TableToolbar({
	title,
	description,
	showFullScreen = true,
	onFullScreenToggle,
}: TableToolbarProps) {
	return (
		<div className="px-3 pt-3 pb-2">
			<div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
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
							className="flex h-8 w-8 items-center justify-center rounded border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
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
