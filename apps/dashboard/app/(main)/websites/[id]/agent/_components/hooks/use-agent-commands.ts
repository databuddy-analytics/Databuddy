import { useChatActions } from "@ai-sdk-tools/store";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import type { AgentCommand } from "../agent-atoms";
import {
	agentInputAtom,
	commandQueryAtom,
	selectedCommandIndexAtom,
	showCommandsAtom,
} from "../agent-atoms";
import { filterCommands } from "../agent-commands";
import { useManualInvoke } from "./use-manual-invoke";

export function useAgentCommands() {
	const [input, setInput] = useAtom(agentInputAtom);
	const [showCommands, setShowCommands] = useAtom(showCommandsAtom);
	const [commandQuery, setCommandQuery] = useAtom(commandQueryAtom);
	const [selectedIndex, setSelectedIndex] = useAtom(selectedCommandIndexAtom);
	const { sendMessage } = useChatActions();
	const { invokeWithDefaults, isLoading: isInvoking } = useManualInvoke();

	const filteredCommands = useMemo(
		() => filterCommands(commandQuery),
		[commandQuery]
	);

	const handleInputChange = useCallback(
		(value: string, cursorPosition: number) => {
			setInput(value);

			const textBeforeCursor = value.substring(0, cursorPosition);
			const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

			if (lastSlashIndex !== -1) {
				const query = textBeforeCursor.substring(lastSlashIndex + 1);
				setCommandQuery(query);
				setShowCommands(true);
				setSelectedIndex(0);
			} else {
				setShowCommands(false);
				setCommandQuery("");
			}
		},
		[setCommandQuery, setInput, setSelectedIndex, setShowCommands]
	);

	const executeCommand = useCallback(
		async (command: AgentCommand) => {
			// Handle manual invoke commands differently
			if (command.manualInvoke) {
				try {
					const result = await invokeWithDefaults(command.toolName);
					// Send the result as a message to display in chat
					sendMessage({
						text: `Executed ${command.title}. Results: ${result.meta?.rowCount ?? 0} rows in ${result.meta?.executionTime ?? 0}ms`,
						metadata: {
							manualInvoke: true,
							toolName: command.toolName,
							result: result.data,
							meta: result.meta,
						},
					});
				} catch (error) {
					sendMessage({
						text: `Failed to execute ${command.title}: ${error instanceof Error ? error.message : "Unknown error"}`,
						metadata: { error: true },
					});
				}
			} else {
				// Regular AI-assisted command
				sendMessage({
					text: command.title,
					metadata: { toolChoice: command.toolName },
				});
			}
			setInput("");
			setShowCommands(false);
			setCommandQuery("");
			setSelectedIndex(0);
		},
		[invokeWithDefaults, sendMessage, setCommandQuery, setInput, setSelectedIndex, setShowCommands]
	);

	const navigateUp = useCallback(() => {
		setSelectedIndex((prev) => Math.max(prev - 1, 0));
	}, [setSelectedIndex]);

	const navigateDown = useCallback(() => {
		setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
	}, [filteredCommands.length, setSelectedIndex]);

	const selectCurrent = useCallback(() => {
		const command = filteredCommands[selectedIndex];
		if (command) {
			executeCommand(command);
		}
	}, [executeCommand, filteredCommands, selectedIndex]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!showCommands || filteredCommands.length === 0) {
				return false;
			}

			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					navigateDown();
					return true;
				case "ArrowUp":
					e.preventDefault();
					navigateUp();
					return true;
				case "Enter":
					e.preventDefault();
					selectCurrent();
					return true;
				case "Escape":
					e.preventDefault();
					setShowCommands(false);
					setCommandQuery("");
					return true;
				default:
					return false;
			}
		},
		[
			filteredCommands.length,
			navigateDown,
			navigateUp,
			selectCurrent,
			setCommandQuery,
			setShowCommands,
			showCommands,
		]
	);

	const closeCommands = useCallback(() => {
		setShowCommands(false);
		setCommandQuery("");
		setSelectedIndex(0);
	}, [setCommandQuery, setSelectedIndex, setShowCommands]);

	return {
		input,
		showCommands,
		filteredCommands,
		selectedIndex,
		handleInputChange,
		handleKeyDown,
		executeCommand,
		closeCommands,
		navigateUp,
		navigateDown,
		selectCurrent,
		isInvoking,
	};
}
