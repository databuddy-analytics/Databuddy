"use client";

import {
	type ComponentProps,
	createContext,
	type HTMLAttributes,
	useContext,
	useMemo,
	useState,
} from "react";
import { createHighlighterCoreSync, type ShikiTransformer } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tsx from "shiki/langs/tsx.mjs";
import oneDarkPro from "shiki/themes/one-dark-pro.mjs";
import oneLight from "shiki/themes/one-light.mjs";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

type CodeBlockLanguage = "tsx";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
	code: string;
	language: CodeBlockLanguage;
	showLineNumbers?: boolean;
};

const highlighter = createHighlighterCoreSync({
	engine: createJavaScriptRegexEngine(),
	langs: [tsx],
	themes: [oneLight, oneDarkPro],
});

interface CodeBlockContextType {
	code: string;
}

const CodeBlockContext = createContext<CodeBlockContextType>({
	code: "",
});

const lineNumberTransformer: ShikiTransformer = {
	name: "line-numbers",
	line(node, line) {
		node.children.unshift({
			type: "element",
			tagName: "span",
			properties: {
				className: [
					"inline-block",
					"min-w-10",
					"mr-4",
					"text-right",
					"select-none",
					"text-muted-foreground",
				],
			},
			children: [{ type: "text", value: String(line) }],
		});
	},
};

function highlightCode(
	code: string,
	language: CodeBlockLanguage,
	showLineNumbers: boolean
) {
	const transformers: ShikiTransformer[] = showLineNumbers
		? [lineNumberTransformer]
		: [];

	return {
		dark: highlighter.codeToHtml(code, {
			lang: language,
			theme: "one-dark-pro",
			transformers,
		}),
		light: highlighter.codeToHtml(code, {
			lang: language,
			theme: "one-light",
			transformers,
		}),
	};
}

export const CodeBlock = ({
	code,
	language,
	showLineNumbers = false,
	className,
	children,
	...props
}: CodeBlockProps) => {
	const { light, dark } = useMemo(
		() => highlightCode(code, language, showLineNumbers),
		[code, language, showLineNumbers]
	);

	return (
		<CodeBlockContext.Provider value={{ code }}>
			<div
				className={cn(
					"group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
					className
				)}
				{...props}
			>
				<div className="relative">
					<div
						className="overflow-hidden dark:hidden [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
						dangerouslySetInnerHTML={{ __html: light }}
					/>
					<div
						className="hidden overflow-hidden dark:block [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm"
						dangerouslySetInnerHTML={{ __html: dark }}
					/>
					{children && (
						<div className="absolute top-2 right-2 flex items-center gap-2">
							{children}
						</div>
					)}
				</div>
			</div>
		</CodeBlockContext.Provider>
	);
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

export const CodeBlockCopyButton = ({
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: CodeBlockCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);
	const { code } = useContext(CodeBlockContext);

	const copyToClipboard = async () => {
		if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
			onError?.(new Error("Clipboard API not available"));
			return;
		}

		try {
			await navigator.clipboard.writeText(code);
			setIsCopied(true);
			onCopy?.();
			setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	};

	const Icon = isCopied ? CheckIcon : CopyIcon;

	return (
		<Button
			className={cn("shrink-0", className)}
			onClick={copyToClipboard}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? <Icon size={14} />}
		</Button>
	);
};
