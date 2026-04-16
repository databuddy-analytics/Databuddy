"use client";

import {
	ChartBarIcon,
	ClipboardTextIcon,
	CompassIcon,
	FileTextIcon,
	FunnelIcon,
	LightningIcon,
	MagnifyingGlassIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AgentCommand } from "./agent-commands";

const COMMAND_ICONS: Record<string, typeof MagnifyingGlassIcon> = {
	"/analyze": MagnifyingGlassIcon,
	"/sources": CompassIcon,
	"/funnel": FunnelIcon,
	"/pages": FileTextIcon,
	"/live": LightningIcon,
	"/anomalies": WarningIcon,
	"/compare": ChartBarIcon,
	"/report": ClipboardTextIcon,
};

function getCommandIcon(command: string) {
	return COMMAND_ICONS[command] ?? MagnifyingGlassIcon;
}

interface AgentCommandMenuProps {
	anchor: React.ReactNode;
	commands: readonly AgentCommand[];
	onDismiss: () => void;
	onHover: (index: number) => void;
	onSelect: (command: AgentCommand) => void;
	open: boolean;
	selectedIndex: number;
}

export function AgentCommandMenu({
	anchor,
	commands,
	onDismiss,
	onHover,
	onSelect,
	open,
	selectedIndex,
}: AgentCommandMenuProps) {
	return (
		<Popover
			onOpenChange={(next) => {
				if (!next) {
					onDismiss();
				}
			}}
			open={open}
		>
			<PopoverAnchor asChild>{anchor}</PopoverAnchor>
			<PopoverContent
				align="start"
				className="w-(--radix-popper-anchor-width) overflow-hidden p-0"
				onOpenAutoFocus={(e) => e.preventDefault()}
				side="top"
				sideOffset={8}
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
								<button
									className={cn(
										"flex w-full items-center gap-3 px-2 py-1.5 text-left transition-colors",
										isSelected
											? "bg-accent text-accent-foreground"
											: "hover:bg-accent/50"
									)}
									onClick={() => onSelect(cmd)}
									onMouseDown={(e) => e.preventDefault()}
									onMouseEnter={() => onHover(idx)}
									type="button"
								>
									<div className="flex size-8 shrink-0 items-center justify-center rounded border bg-background">
										<Icon
											className="size-4 text-foreground/60"
											weight="duotone"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm leading-tight">
											{cmd.title}
										</p>
										<p className="truncate text-foreground/50 text-xs leading-snug">
											{cmd.description}
										</p>
									</div>
									<span className="shrink-0 font-mono text-foreground/30 text-xs">
										{cmd.command}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</PopoverContent>
		</Popover>
	);
}
