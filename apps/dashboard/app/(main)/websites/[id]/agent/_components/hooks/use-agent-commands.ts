import { useAtom } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { useChat } from "@/contexts/chat-context";
import type { AgentCommand } from "../agent-atoms";
import {
	agentInputAtom,
	commandQueryAtom,
	showCommandsAtom,
} from "../agent-atoms";
import { filterCommands } from "../agent-commands";

export function useAgentCommands() {
	const [_, setInput] = useAtom(agentInputAtom);
	const [showCommands, setShowCommands] = useAtom(showCommandsAtom);
	const [commandQuery, setCommandQuery] = useAtom(commandQueryAtom);
	const inputRef = useRef<HTMLInputElement>(null);

	const { sendMessage } = useChat();

	const filteredCommands = useMemo(
		() => filterCommands(commandQuery),
		[commandQuery]
	);

	const hideCommands = useCallback(() => {
		setShowCommands(false);
		// Focus the input when commands are hidden
		inputRef.current?.focus();
	}, []);

	const handleInputChange = useCallback(
		(value: string, cursorPosition: number) => {
			setInput(value);

			const textBeforeCursor = value.substring(0, cursorPosition);
			const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

			if (lastSlashIndex !== -1) {
				const query = textBeforeCursor.substring(lastSlashIndex + 1);
				setCommandQuery(query);
				setShowCommands(true);
			} else {
				hideCommands();
				setCommandQuery("");
			}
		},
		[setCommandQuery, setInput, hideCommands]
	);

	const executeCommand = useCallback(
		(command: AgentCommand) => {
			sendMessage({
				text: command.title,
				metadata: { toolChoice: command.toolName },
			});
			setInput("");
			hideCommands();
			setCommandQuery("");
		},
		[sendMessage, setCommandQuery, setInput, hideCommands]
	);

	const closeCommands = useCallback(() => {
		hideCommands();
		setCommandQuery("");
	}, [setCommandQuery, hideCommands]);

	return {
		inputRef,
		showCommands,
		filteredCommands,
		handleInputChange,
		executeCommand,
		closeCommands,
	};
}
