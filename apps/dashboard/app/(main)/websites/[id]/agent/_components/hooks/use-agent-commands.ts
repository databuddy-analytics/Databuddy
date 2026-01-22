import { useDebouncedCallback } from"@tanstack/react-pacer";
import { useAtom, useSetAtom } from"jotai";
import { useCallback, useMemo, useRef, useState } from"react";
import { useChat } from"@/contexts/chat-context";
import type { AgentCommand } from"../agent-atoms";
import {
	agentInputAtom,
	commandQueryAtom,
	showCommandsAtom,
} from"../agent-atoms";
import { filterCommands } from"../agent-commands";

export function useAgentCommands() {
	const setInput = useSetAtom(agentInputAtom);
	const [showCommands, setShowCommands] = useAtom(showCommandsAtom);
	const setCommandQuery = useSetAtom(commandQueryAtom);
	const [localQuery, setLocalQuery] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const { sendMessage } = useChat();

	const debouncedSetCommandQuery = useDebouncedCallback(
		(query: string) => {
			setCommandQuery(query);
			if (query) {
				setShowCommands(true);
			} else {
				setShowCommands(false);
			}
		},
		{ wait: 200 }
	);

	const filteredCommands = useMemo(
		() => filterCommands(localQuery),
		[localQuery]
	);

	const hideCommands = useCallback(() => {
		setShowCommands(false);
		setLocalQuery("");
		setCommandQuery("");
		// Focus the input when commands are hidden
		inputRef.current?.focus();
	}, [setCommandQuery]);

	const handleInputChange = useCallback(
		(value: string, cursorPosition: number) => {
			setInput(value);

			const textBeforeCursor = value.substring(0, cursorPosition);
			const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

			if (lastSlashIndex !== -1) {
				const query = textBeforeCursor.substring(lastSlashIndex + 1);
				setLocalQuery(query);
				debouncedSetCommandQuery(query);
			} else {
				setLocalQuery("");
				hideCommands();
			}
		},
		[setInput, debouncedSetCommandQuery, hideCommands]
	);

	const executeCommand = useCallback(
		(command: AgentCommand) => {
			sendMessage({
				text: command.title,
				metadata: { toolChoice: command.toolName },
			});
			setInput("");
			hideCommands();
		},
		[sendMessage, setInput, hideCommands]
	);

	const closeCommands = useCallback(() => {
		hideCommands();
	}, [hideCommands]);

	return {
		inputRef,
		showCommands,
		filteredCommands,
		handleInputChange,
		executeCommand,
		closeCommands,
	};
}
