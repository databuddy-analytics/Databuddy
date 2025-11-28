import type * as React from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import json from "shiki/langs/json.mjs";
import jsx from "shiki/langs/jsx.mjs";
import markdown from "shiki/langs/markdown.mjs";
import tsx from "shiki/langs/tsx.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import vesper from "shiki/themes/vesper.mjs";
import { SciFiCard } from "@/components/scifi-card";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

interface CodeBlockProps extends React.ComponentProps<"div"> {
	language?: string;
	filename?: string;
	code?: string;
	children?: React.ReactNode;
}

const highlighter = createHighlighterCoreSync({
	themes: [vesper, githubLight],
	langs: [tsx, jsx, html, css, json, markdown],
	engine: createJavaScriptRegexEngine(),
});

function CodeBlock({
	children,
	className,
	language = "text",
	filename,
	code,
}: CodeBlockProps) {
	const content = (code ?? children) as string;

	if (!content || typeof content !== "string") {
		return null;
	}

	let highlightedCode: string | null = null;

	if (language !== "text" && language !== "plaintext") {
		try {
			highlightedCode = highlighter.codeToHtml(content, {
				lang: language,
				themes: {
					light: "github-light",
					dark: "vesper",
				},
				defaultColor: false,
				transformers: [
					{
						pre(node) {
							node.properties.style = "";
							node.properties.tabindex = "-1";
						},
						code(node) {
							node.properties.style = "";
						},
					},
				],
			});
		} catch {
			highlightedCode = null;
		}
	}

	return (
		<SciFiCard
			className="group/code relative my-4 w-full overflow-hidden rounded border border-border bg-[#101010] text-sm backdrop-blur-sm transition-all duration-300 hover:border-primary/20"
			cornerOpacity="opacity-0 group-hover/code:opacity-100"
			variant="primary"
		>
			{(language !== "text" || filename) && (
				<div className="flex items-center justify-between border-white/5 border-b bg-white/5 px-4 py-2.5">
					<div className="flex items-center gap-3">
						{filename && (
							<span className="font-medium text-foreground/80 text-xs tracking-tight">
								{filename}
							</span>
						)}
						{language !== "text" && (
							<span className="rounded bg-primary/10 px-2 py-0.5 font-medium font-mono text-[10px] text-primary uppercase tracking-wider">
								{language}
							</span>
						)}
					</div>
					<CopyButton className="h-6 w-6" value={content} />
				</div>
			)}

			{!filename && language === "text" && (
				<div className="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover/code:opacity-100">
					<CopyButton
						className="h-7 w-7 bg-background/50 backdrop-blur-md"
						value={content}
					/>
				</div>
			)}

			<div className="relative">
				{highlightedCode ? (
					<div
						className={cn(
							"overflow-x-auto font-mono text-[13px] leading-relaxed",
							"[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:leading-relaxed",
							"[&>pre>code]:block [&>pre>code]:w-full",
							"[&_.line]:min-h-5",
							className
						)}
						dangerouslySetInnerHTML={{ __html: highlightedCode }}
					/>
				) : (
					<pre
						className={cn(
							"overflow-x-auto p-4 font-mono text-foreground text-sm leading-relaxed",
							"[&>code]:block [&>code]:w-full [&>code]:p-0 [&>code]:text-inherit",
							className
						)}
						tabIndex={-1}
					>
						<code>{content}</code>
					</pre>
				)}
			</div>
		</SciFiCard>
	);
}

function InlineCode({ className, ...props }: React.ComponentProps<"code">) {
	return (
		<code
			className={cn(
				"rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium font-mono text-primary text-sm",
				className
			)}
			{...props}
		/>
	);
}

export { CodeBlock, InlineCode };
