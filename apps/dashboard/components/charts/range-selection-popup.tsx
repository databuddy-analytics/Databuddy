"use client";

import { MagnifyingGlassPlusIcon, NoteIcon } from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";

type RangeSelectionPopupProps = {
	isOpen: boolean;
	dateRange: {
		startDate: Date;
		endDate: Date;
	};
	onCloseAction: () => void;
	onZoomAction: (dateRange: { startDate: Date; endDate: Date }) => void;
	onAddAnnotationAction: () => void;
};

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

	useHotkeys(
		"escape",
		() => {
			onCloseAction();
		},
		{ enabled: isOpen },
		[onCloseAction]
	);

	if (!isOpen) {
		return null;
	}

	const formatDateRange = () => {
		const start = dateRange.startDate.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
		const end = dateRange.endDate.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
		return dateRange.startDate.getTime() !== dateRange.endDate.getTime()
			? `${start} – ${end}`
			: start;
	};

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center">
			{/* Backdrop to catch clicks */}
			<button
				aria-label="Close"
				className="absolute inset-0 cursor-default bg-transparent"
				onClick={onCloseAction}
				type="button"
			/>
			<div className="relative min-w-[180px] overflow-hidden rounded border bg-popover shadow-xl">
				<div className="border-b bg-accent px-3 py-2">
					<p className="font-medium text-foreground text-xs">
						{formatDateRange()}
					</p>
				</div>
				<div className="p-1">
					<button
						className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-accent"
						onClick={handleZoom}
						type="button"
					>
						<MagnifyingGlassPlusIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
						<span className="flex-1 text-foreground">Zoom to range</span>
						<kbd className="rounded border bg-accent px-1.5 py-0.5 text-[10px] text-foreground">
							Z
						</kbd>
					</button>
					<button
						className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-accent"
						onClick={onAddAnnotationAction}
						type="button"
					>
						<NoteIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
						<span className="flex-1 text-foreground">Add annotation…</span>
						<kbd className="rounded border bg-accent px-1.5 py-0.5 text-[10px] text-foreground">
							A
						</kbd>
					</button>
				</div>
			</div>
		</div>
	);
}
