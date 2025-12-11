"use client";

import {
	ChartBarIcon,
	FileTextIcon,
	LightbulbIcon,
	MagnifyingGlassIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { useAgentCommands } from "./hooks/use-agent-commands";

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

export function AgentCommandMenu({
	showCommands,
	filteredCommands,
	closeCommands,
	executeCommand,
}: ReturnType<typeof useAgentCommands>) {
	if (!showCommands || filteredCommands.length === 0) {
		return null;
	}

	return (
		<Popover
			onOpenChange={(open) => {
				if (!open) {
					closeCommands();
				}
			}}
			open={showCommands}
		>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={showCommands}
					className="-z-1 absolute inset-0 justify-between opacity-0"
					role="combobox"
					variant="outline"
				>
					Select command...
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-(--radix-popper-anchor-width) p-0">
				<Command>
					<CommandInput className="h-9" placeholder="Search command..." />
					<CommandList className="bg-sidebar/95!">
						<CommandEmpty>No commands found.</CommandEmpty>
						<CommandGroup>
							{filteredCommands.map((command) => {
								const Icon = getCommandIcon(command.command);

								return (
									<CommandItem
										className="rounded-none data-[selected=true]:rounded data-[selected=true]:bg-accent/50"
										key={command.id}
										onSelect={() => {
											executeCommand(command);
										}}
										value={command.title}
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
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
