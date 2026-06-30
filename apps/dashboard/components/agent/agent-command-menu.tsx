"use client";

import { cn } from "@/lib/utils";
import type { AgentCommand } from "./agent-commands";
import type { NavIcon } from "@/components/layout/navigation/types";
import {
	ChartBarIcon,
	ClipboardIcon,
	CompassIcon,
	FileTextIcon,
	FunnelIcon,
	LightningIcon,
	MagnifyingGlassIcon,
	TrashIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

const COMMAND_ICONS: Record<string, NavIcon> = {
	"/analyze": MagnifyingGlassIcon,
	"/sources": CompassIcon,
	"/funnel": FunnelIcon,
	"/pages": FileTextIcon,
	"/live": LightningIcon,
	"/anomalies": WarningIcon,
	"/compare": ChartBarIcon,
	"/report": ClipboardIcon,
	"/clear": TrashIcon,
};

function getCommandIcon(command: string) {
	return COMMAND_ICONS[command] ?? MagnifyingGlassIcon;
}

interface AgentCommandMenuProps {
	anchor: React.ReactNode;
	commands: readonly AgentCommand[];
	onHover: (index: number) => void;
	onSelect: (command: AgentCommand) => void;
	open: boolean;
	selectedIndex: number;
}

export function AgentCommandMenu({
	anchor,
	commands,
	onHover,
	onSelect,
	open,
	selectedIndex,
}: AgentCommandMenuProps) {
	return (
		<div className="relative">
			{anchor}
			{open ? (
				<div
					className={cn(
						"absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded border border-border/60 bg-popover shadow-lg",
						"fade-in slide-in-from-bottom-1 animate-in duration-150"
					)}
				>
					<div className="border-border/60 border-b bg-muted/40 px-3 py-1.5 font-medium text-[10px] text-muted-foreground uppercase">
						Commands
					</div>
					<ul className="max-h-72 overflow-y-auto py-1">
						{commands.map((cmd, idx) => {
							const Icon = getCommandIcon(cmd.command);
							const isSelected = idx === selectedIndex;
							return (
								<li key={cmd.id}>
									<Button
										className={cn(
											"h-auto w-full justify-start whitespace-normal rounded-none px-2 py-1.5 text-left",
											isSelected
												? "bg-accent text-accent-foreground"
												: "hover:bg-accent/50"
										)}
										onClick={() => onSelect(cmd)}
										onMouseDown={(e) => e.preventDefault()}
										onMouseEnter={() => onHover(idx)}
										variant="ghost"
									>
										<span className="flex size-8 shrink-0 items-center justify-center rounded border bg-background">
											<Icon className="size-4 text-foreground/60" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium text-sm leading-tight">
												{cmd.title}
											</span>
											<span className="block truncate text-foreground/50 text-xs leading-snug">
												{cmd.description}
											</span>
										</span>
										<span className="shrink-0 font-mono text-foreground/30 text-xs">
											{cmd.command}
										</span>
									</Button>
								</li>
							);
						})}
					</ul>
				</div>
			) : null}
		</div>
	);
}
