import {
	ArrowsOutSimpleIcon,
	MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';

interface TableToolbarProps {
	title: string;
	description?: string;
	showFullScreen?: boolean;
	onFullScreenToggle?: () => void;
	searchValue?: string;
	onSearchChange?: (value: string) => void;
	showSearch?: boolean;
}

export function TableToolbar({
	title,
	description,
	showFullScreen = true,
	onFullScreenToggle,
	searchValue = '',
	onSearchChange,
	showSearch = true,
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
					{showSearch && onSearchChange && (
						<div className="relative">
							<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								className="h-8 w-64 pl-8 text-sm"
								onChange={(e) => onSearchChange(e.target.value)}
								placeholder="Search..."
								type="search"
								value={searchValue}
							/>
						</div>
					)}
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
