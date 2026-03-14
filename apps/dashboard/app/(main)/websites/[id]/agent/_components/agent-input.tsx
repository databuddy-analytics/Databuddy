"use client";

import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/ssr/PaperPlaneRight";
import { StopIcon } from "@phosphor-icons/react/dist/ssr/Stop";
import type { UIMessage } from "ai";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChat } from "@/contexts/chat-context";
import { cn } from "@/lib/utils";
import { agentInputAtom } from "./agent-atoms";
import { useAgentChatId, useSetAgentChatId } from "./agent-chat-context";
import { AgentCommandMenu } from "./agent-command-menu";
import { useAgentCommands } from "./hooks/use-agent-commands";
import { useChatList } from "./hooks/use-chat-db";
import { useEnterSubmit } from "./hooks/use-enter-submit";

function getChatTitle(messages: UIMessage[], currentInput: string): string {
	const firstUserMsg = messages.find((m) => m.role === "user");
	if (firstUserMsg) {
		const text = firstUserMsg.parts
			.filter(
				(p): p is Extract<UIMessage["parts"][number], { type: "text" }> =>
					p.type === "text"
			)
			.map((p) => p.text)
			.join(" ")
			.trim();
		return text.slice(0, 100) || "New conversation";
	}
	return currentInput.slice(0, 100) || "New conversation";
}

export function AgentInput() {
	const { sendMessage, stop, status, messages } = useChat();
	const isLoading = status === "streaming" || status === "submitted";
	const [input, setInput] = useAtom(agentInputAtom);
	const agentCommands = useAgentCommands();
	const currentChatId = useAgentChatId();
	const setChatId = useSetAgentChatId();
	const { formRef, onKeyDown } = useEnterSubmit();
	const params = useParams();
	const websiteId = params.id as string;
	const { saveChat } = useChatList(websiteId);

	const handleSubmit = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!input.trim() || isLoading) {
			return;
		}
		if (currentChatId) {
			setChatId(currentChatId);
		}

		const text = input.trim();

		const title = getChatTitle(messages, text);
		saveChat({ id: currentChatId, websiteId, title });

		sendMessage({ text });
		setInput("");
	};

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
							<Textarea
								className={cn(
									"px-4 text-base",
									"focus:ring-2 focus:ring-primary/20"
								)}
								disabled={isLoading}
								maxRows={4}
								minRows={1}
								onChange={handleChange}
								onKeyDown={onKeyDown}
								placeholder="Ask the agent to analyze your data..."
								ref={agentCommands.inputRef}
								value={input}
							/>
						</div>

						{isLoading ? (
							<Button
								className="size-12 shrink-0"
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
								className="size-12 shrink-0"
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
