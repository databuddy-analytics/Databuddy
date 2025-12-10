"use client";

import { useChatActions } from "@ai-sdk-tools/store";
import { PaperPlaneRightIcon, StopIcon } from "@phosphor-icons/react";
import type { ChatStatus } from "ai";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEnterSubmit } from "@/hooks/use-enter-submit";
import { cn } from "@/lib/utils";
import { agentInputAtom } from "./agent-atoms";
import { useAgentChatId, useSetAgentChatId } from "./agent-chat-context";
import { AgentCommandMenu } from "./agent-command-menu";
import { useAgentCommands } from "./hooks/use-agent-commands";

export function AgentInput({ status }: { status: ChatStatus }) {
	const { sendMessage, stop } = useChatActions();
	const isLoading = status === "streaming" || status === "submitted";
	const [input, setInput] = useAtom(agentInputAtom);
	const agentCommands = useAgentCommands();
	const currentChatId = useAgentChatId();
	const setChatId = useSetAgentChatId();
	const { formRef, onKeyDown } = useEnterSubmit();

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!input.trim() || isLoading) {
			return;
		}
		if (currentChatId) {
			setChatId(currentChatId);
		}

		sendMessage({
			text: input.trim(),
		});

		setInput("");
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		agentCommands.handleInputChange(
			e.target.value,
			e.target.selectionStart ?? 0
		);
	};

	const handleStop = (e: React.MouseEvent) => {
		e.preventDefault();
		stop();
	};

	return (
		<div className="shrink-0 border-t bg-sidebar/30 backdrop-blur-sm">
			<div className="mx-auto max-w-4xl p-4">
				<div className="relative">
					<AgentCommandMenu {...agentCommands} />

					<form className="flex gap-2" onSubmit={handleSubmit} ref={formRef}>
						<div className="relative flex-1">
							<Input
								className={cn(
									"h-12 pr-24 pl-4 text-base",
									"focus:ring-2 focus:ring-primary/20"
								)}
								disabled={isLoading}
								onChange={handleChange}
								onKeyDown={onKeyDown}
								placeholder="Ask the agent to analyze your data..."
								ref={agentCommands.inputRef}
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
