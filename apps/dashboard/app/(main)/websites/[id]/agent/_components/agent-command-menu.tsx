"use client";

import {
	ChartBarIcon,
	FileTextIcon,
	LightbulbIcon,
	MagnifyingGlassIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { AgentCommand } from "./agent-atoms";
import { useAgentCommands } from "./hooks/use-agent-commands";

const COMMAND_ICONS: Record<string, typeof MagnifyingGlassIcon> = {
	analyze: MagnifyingGlassIcon,
	report: FileTextIcon,
	chart: ChartBarIcon,
	show: TableIcon,
	find: LightbulbIcon,
	compare: ChartBarIcon,
};

function getCommandIcon(command: string) {
	const prefix = command.replace("/", "");
	return COMMAND_ICONS[prefix] ?? MagnifyingGlassIcon;
}

export function AgentCommandMenu() {
	const menuRef = useRef<HTMLDivElement>(null);
	const { showCommands, filteredCommands, selectedIndex, executeCommand } =
		useAgentCommands();

	if (!showCommands || filteredCommands.length === 0) {
		return null;
	}

	return (
		<AnimatePresence>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="absolute right-0 bottom-full left-0 z-30 mb-2"
				exit={{ opacity: 0, y: 8 }}
				initial={{ opacity: 0, y: 8 }}
				ref={menuRef}
				transition={{ duration: 0.15 }}
			>
				<div className="overflow-hidden rounded border bg-sidebar/95 shadow-lg backdrop-blur-lg">
					<div className="max-h-64 overflow-y-auto p-1">
						{filteredCommands.map((command: AgentCommand, index: number) => {
							const isSelected = selectedIndex === index;
							const Icon = getCommandIcon(command.command);

							return (
								<button
									className={cn(
										"flex w-full items-center gap-3 rounded px-3 py-2 text-left",
										"transition-colors",
										isSelected ? "bg-accent" : "hover:bg-accent/50"
									)}
									data-index={index}
									key={command.id}
									onClick={() => executeCommand(command)}
									onMouseDown={(e) => e.preventDefault()}
									type="button"
								>
									<div className="flex size-8 shrink-0 items-center justify-center rounded border bg-background">
										<Icon
											className="size-4 text-foreground/60"
											weight="duotone"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm">
											{command.title}
										</p>
										<p className="truncate text-foreground/50 text-xs">
											{command.description}
										</p>
									</div>
									<span className="text-foreground/30 text-xs">
										{command.command}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			</motion.div>
		</AnimatePresence>
	);
}
