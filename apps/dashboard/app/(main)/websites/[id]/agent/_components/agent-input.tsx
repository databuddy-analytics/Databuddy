"use client";

import { PaperPlaneRightIcon, StopIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEnterSubmit } from "@/hooks/use-enter-submit";
import { cn } from "@/lib/utils";
import { useAgentChatId, useSetAgentChatId } from "./agent-chat-context";
import { AgentCommandMenu } from "./agent-command-menu";
import { useAgentChat, useAgentCommands } from "./hooks";

export function AgentInput() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isFocused, setIsFocused] = useState(false);
	const { sendMessage, stop, isLoading } = useAgentChat();
	const { input, handleInputChange, handleKeyDown, showCommands } =
		useAgentCommands();
	const chatId = useAgentChatId();
	const setChatId = useSetAgentChatId();
	const { formRef, onKeyDown: handleEnterSubmit } = useEnterSubmit();

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!input.trim() || isLoading) {
			return;
		}
		if (chatId) {
			setChatId(chatId);
		}
		sendMessage(input.trim());
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		handleInputChange(e.target.value, e.target.selectionStart ?? 0);
	};

	const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (handleKeyDown(e)) {
			return;
		}

		if (!showCommands) {
			handleEnterSubmit(e);
		}
	};

	const handleStop = (e: React.MouseEvent) => {
		e.preventDefault();
		stop();
	};

	return (
		<div className="shrink-0 border-t bg-sidebar/30 backdrop-blur-sm">
			<div className="mx-auto max-w-2xl p-4">
				<div className="relative">
					<AgentCommandMenu />

					<form className="flex gap-2" onSubmit={handleSubmit} ref={formRef}>
						<div className="relative flex-1">
							<Input
								className={cn(
									"h-12 pr-24 pl-4 text-base",
									isFocused && "ring-2 ring-primary/20"
								)}
								disabled={isLoading}
								onBlur={() => setIsFocused(false)}
								onChange={handleChange}
								onFocus={() => setIsFocused(true)}
								onKeyDown={handleKey}
								placeholder="Ask the agent to analyze your data..."
								ref={inputRef}
								value={input}
							/>
						</div>

						{isLoading ? (
							<Button
								className="h-12 w-12 shrink-0"
								onClick={handleStop}
								size="icon"
								title="Stop generation"
								type="button"
								variant="destructive"
							>
								<StopIcon className="size-5" weight="fill" />
							</Button>
						) : (
							<Button
								className="h-12 w-12 shrink-0"
								disabled={!input.trim()}
								size="icon"
								title="Send message"
								type="submit"
							>
								<PaperPlaneRightIcon className="size-5" weight="duotone" />
							</Button>
						)}
					</form>
				</div>

				<p className="mt-2 text-foreground/40 text-xs">
					Press{" "}
					<kbd className="rounded border border-border/50 bg-accent px-1 font-mono text-[10px] text-foreground/70">
						Enter
					</kbd>{" "}
					to send ·{" "}
					<kbd className="rounded border border-border/50 bg-accent px-1 font-mono text-[10px] text-foreground/70">
						/
					</kbd>{" "}
					for commands
				</p>
			</div>
		</div>
	);
}
