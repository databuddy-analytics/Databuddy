"use client";

import { MagnifyingGlassPlusIcon, NoteIcon } from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";

interface RangeSelectionPopupProps {
	isOpen: boolean;
	dateRange: {
		startDate: Date;
		endDate: Date;
	};
	onCloseAction: () => void;
	onZoomAction: (dateRange: { startDate: Date; endDate: Date }) => void;
	onAddAnnotationAction: () => void;
}

export function RangeSelectionPopup({
	isOpen,
	dateRange,
	onCloseAction,
	onZoomAction,
	onAddAnnotationAction,
}: RangeSelectionPopupProps) {
	const handleZoom = () => {
		onZoomAction(dateRange);
		onCloseAction();
	};

	useHotkeys(
		"z",
		(e) => {
			if (!(e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleZoom();
			}
		},
		{ preventDefault: false, enabled: isOpen },
		[dateRange, onZoomAction, onCloseAction]
	);

	useHotkeys(
		"a",
		(e) => {
			if (!(e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				onAddAnnotationAction();
			}
		},
		{ preventDefault: false, enabled: isOpen },
		[onAddAnnotationAction]
	);

	useHotkeys("escape", () => onCloseAction(), { enabled: isOpen }, [
		onCloseAction,
	]);

	if (!isOpen) {
		return null;
	}

	const formatDateRange = () => {
		const opts: Intl.DateTimeFormatOptions = {
			month: "short",
			day: "numeric",
		};
		const start = dateRange.startDate.toLocaleDateString("en-US", opts);
		const end = dateRange.endDate.toLocaleDateString("en-US", opts);
		return dateRange.startDate.getTime() === dateRange.endDate.getTime()
			? start
			: `${start} – ${end}`;
	};

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center">
			<button
				aria-label="Close"
				className="absolute inset-0 cursor-default bg-transparent"
				onClick={onCloseAction}
				type="button"
			/>
			<div className="relative min-w-[160px] overflow-hidden rounded border bg-popover shadow-xl">
				<div className="border-b px-3 py-1.5">
					<p className="font-medium text-foreground text-xs">
						{formatDateRange()}
					</p>
				</div>
				<div className="p-0.5">
					<button
						className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
						onClick={handleZoom}
						type="button"
					>
						<MagnifyingGlassPlusIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
						<span className="flex-1 text-foreground text-xs">
							Zoom to range
						</span>
						<kbd className="rounded border px-1 py-px text-[10px] text-muted-foreground">
							Z
						</kbd>
					</button>
					<button
						className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
						onClick={onAddAnnotationAction}
						type="button"
					>
						<NoteIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
						<span className="flex-1 text-foreground text-xs">
							Add annotation…
						</span>
						<kbd className="rounded border px-1 py-px text-[10px] text-muted-foreground">
							A
						</kbd>
					</button>
				</div>
			</div>
		</div>
	);
}
