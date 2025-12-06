"use client";

import { authClient } from "@databuddy/auth/client";
import { PaperclipIcon, WarningIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import Image from "next/image";
import {
	Message,
	MessageAvatar,
	MessageContent,
} from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
import { ToolOutput } from "@/components/ai-elements/tool";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AgentMessagesProps = {
	messages: UIMessage[];
	isStreaming?: boolean;
	hasError?: boolean;
};

function getTextContent(message: UIMessage): string {
	if (!message.parts) {
		return "";
	}
	return message.parts
		.filter(
			(part): part is { type: "text"; text: string } => part.type === "text"
		)
		.map((part) => part.text)
		.join("");
}

function extractFileParts(parts: UIMessage["parts"]) {
	return parts.filter((part) => part.type === "file");
}

function extractToolParts(parts: UIMessage["parts"]) {
	return parts.filter((part) => part.type?.startsWith("tool")) as Array<{
		type: string;
		toolCallId?: string;
		toolName?: string;
		output?: unknown;
		errorText?: string;
	}>;
}

export function AgentMessages({
	messages,
	isStreaming = false,
	hasError = false,
}: AgentMessagesProps) {
	if (messages.length === 0) {
		return null;
	}

	return (
		<>
			{messages.map((message, index) => {
				const isLastMessage = index === messages.length - 1;
				const isAssistant = message.role === "assistant";
				const textContent = getTextContent(message);
				const fileParts = extractFileParts(message.parts);
				const toolParts = extractToolParts(message.parts);
				const hasToolErrors = toolParts.some((tool) => tool.errorText);
				const showError = isLastMessage && hasError && isAssistant;

				return (
					<div className="group" key={message.id}>
						{/* Render tool parts (including errors) */}
						{toolParts.length > 0 && (
							<Message from={message.role}>
								<MessageContent className="max-w-[80%]">
									<div className="space-y-2">
										{toolParts.map((toolPart) => (
											<div key={toolPart.toolCallId}>
												{toolPart.errorText && (
													<div className="rounded border border-destructive/20 bg-destructive/5 p-3">
														<div className="flex items-start gap-2">
															<WarningIcon
																className="mt-0.5 size-4 shrink-0 text-destructive"
																weight="fill"
															/>
															<div className="min-w-0 flex-1">
																<p className="mb-1 font-medium text-destructive text-sm">
																	Tool Error: {toolPart.toolName}
																</p>
																<p className="text-destructive/80 text-xs">
																	{toolPart.errorText}
																</p>
															</div>
														</div>
													</div>
												)}
												{!toolPart.errorText &&
													toolPart.output !== undefined && (
														<ToolOutput
															errorText={toolPart.errorText}
															output={
																typeof toolPart.output === "string" ||
																typeof toolPart.output === "object"
																	? (toolPart.output as
																			| string
																			| Record<string, unknown>)
																	: String(toolPart.output)
															}
														/>
													)}
											</div>
										))}
									</div>
								</MessageContent>
								{message.role === "assistant" && (
									<AgentMessageAvatar hasError={hasToolErrors} />
								)}
							</Message>
						)}

						{/* Render file attachments */}
						{fileParts.length > 0 && (
							<Message from={message.role}>
								<MessageContent className="max-w-[80%]">
									<div className="mb-2 flex flex-wrap gap-2">
										{fileParts.map((part) => {
											if (part.type !== "file") {
												return null;
											}

											const file = part as {
												type: "file";
												url?: string;
												mediaType?: string;
												filename?: string;
											};

											const fileKey = `${file.url}-${file.filename}`;
											const isImage = file.mediaType?.startsWith("image/");

											if (isImage && file.url) {
												return (
													<div
														className="relative overflow-hidden rounded border"
														key={fileKey}
													>
														<Image
															alt={file.filename || "attachment"}
															className="max-h-48 max-w-xs object-cover"
															height={192}
															src={file.url}
															unoptimized
															width={300}
														/>
													</div>
												);
											}

											return (
												<div
													className="flex items-center gap-2 rounded border bg-muted/50 px-3 py-2"
													key={fileKey}
												>
													<PaperclipIcon
														className="size-4 shrink-0 text-muted-foreground"
														weight="duotone"
													/>
													<span className="font-medium text-sm">
														{file.filename || "Unknown file"}
													</span>
												</div>
											);
										})}
									</div>
								</MessageContent>
								{message.role === "user" && <UserMessageAvatar />}
							</Message>
						)}

						{/* Render text content */}
						{textContent && !showError && (
							<Message from={message.role}>
								<MessageContent className="max-w-[80%]" variant="flat">
									{isLastMessage && isStreaming ? (
										<Response isAnimating>{textContent}</Response>
									) : (
										<Response>{textContent}</Response>
									)}
								</MessageContent>
								{message.role === "user" && <UserMessageAvatar />}
								{message.role === "assistant" && (
									<AgentMessageAvatar hasError={hasError} />
								)}
							</Message>
						)}

						{/* Render error state */}
						{showError && (
							<Message from="assistant">
								<MessageContent className="max-w-[80%]">
									<div className="space-y-2">
										<p className="font-medium text-destructive text-sm">
											Failed to generate response
										</p>
										<p className="text-muted-foreground text-xs">
											There was an error processing your request. Please try
											again.
										</p>
									</div>
								</MessageContent>
								<AgentMessageAvatar hasError />
							</Message>
						)}
					</div>
				);
			})}
		</>
	);
}

function UserMessageAvatar() {
	const { data: session, isPending } = authClient.useSession();
	const user = session?.user;

	if (isPending) {
		return <Skeleton className="size-8 shrink-0 rounded-full" />;
	}

	return (
		<MessageAvatar
			name={user?.name || user?.email || "User"}
			src={user?.image || ""}
		/>
	);
}

function AgentMessageAvatar({ hasError = false }: { hasError?: boolean }) {
	return (
		<Avatar className="size-8 shrink-0 ring-1 ring-border">
			<AvatarImage alt="Databunny" src="/databunny.webp" />
			<AvatarFallback
				className={cn(
					"bg-primary/10 font-semibold text-primary",
					hasError && "bg-destructive/10 text-destructive"
				)}
			>
				DB
			</AvatarFallback>
		</Avatar>
	);
}

export function MessagesLoadingSkeleton() {
	return (
		<div className="space-y-4">
			<Message from="user">
				<MessageContent className="max-w-[80%]">
					<Skeleton className="h-4 w-32" />
				</MessageContent>
				<Skeleton className="size-8 shrink-0 rounded-full" />
			</Message>
			<Message from="assistant">
				<Skeleton className="size-8 shrink-0 rounded-full" />
				<MessageContent className="max-w-[80%]">
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				</MessageContent>
			</Message>
		</div>
	);
}
