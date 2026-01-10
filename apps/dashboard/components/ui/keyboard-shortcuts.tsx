    "use client";

import { cn } from "@/lib/utils";
import { useMemo } from "react";

type ShortcutGroup = {
	title: string;
	shortcuts: {
		label: string;
		keys: string;
		macKeys?: string;
	}[];
};

const SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		title: "General",
		shortcuts: [
			{ label: "Search", keys: "Ctrl+K", macKeys: "⌘K" },
		],
	},
	{
		title: "Forms & Dialogs",
		shortcuts: [
			{ label: "Submit form", keys: "Enter" },
			{ label: "Close dialog", keys: "Esc" },
		],
	},
	{
		title: "Date Ranges",
		shortcuts: [
			{ label: "Last 24 hours", keys: "1" },
			{ label: "Last 7 days", keys: "2" },
			{ label: "Last 30 days", keys: "3" },
			{ label: "Last 90 days", keys: "4" },
			{ label: "Last 180 days", keys: "5" },
			{ label: "Last 365 days", keys: "6" },
		],
	},
	{
		title: "Chart Selection",
		shortcuts: [
			{ label: "Zoom to range", keys: "Z" },
			{ label: "Add annotation", keys: "A" },
		],
	},
];

function isMac() {
	if (typeof window === "undefined") {
		return false;
	}
	return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
}

type KeyboardShortcutsProps = {
	groups?: ShortcutGroup[];
	compact?: boolean;
};

export function KeyboardShortcuts({
	groups = SHORTCUT_GROUPS,
	compact = false,
}: KeyboardShortcutsProps) {
	const isMacOS = useMemo(() => isMac(), []);

	return (
		<div className={compact ? "divide-y dark:divide-border divide-border/50" : "space-y-4"}>
			{groups.map((group) => (
				<div key={group.title} className={cn({"py-3 first:pt-0 last:pb-0": compact})}>
					{!compact && (
						<h4 className="mb-2 font-medium text-sm text-foreground">
							{group.title}
						</h4>
					)}
					<div className={compact ? "space-y-1.5" : "space-y-2"}>
						{group.shortcuts.map((shortcut) => {
							const displayKeys = isMacOS && shortcut.macKeys
								? shortcut.macKeys
								: shortcut.keys;
							return (
								<div
									className="flex items-center justify-between"
									key={shortcut.label}
								>
									<span className="text-muted-foreground dark:text-foreground/70 text-sm">
										{shortcut.label}
									</span>
									<kbd className="rounded border bg-secondary px-1.5 py-0.5 text-xs">
										{displayKeys}
									</kbd>
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

