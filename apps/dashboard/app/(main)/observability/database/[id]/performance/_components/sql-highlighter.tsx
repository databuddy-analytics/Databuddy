"use client";

import { useEffect, useState } from "react";
import { codeToTokens } from "shiki";

interface SqlHighlighterProps {
	code: string;
	className?: string;
}

interface Token {
	content: string;
	color?: string;
	fontStyle?: number;
}

const cleanQuery = (queryText: string): string => {
	// Remove SQL comments (-- comments and /* */ comments)
	return queryText
		.replace(/--.*$/gm, "") // Remove line comments
		.replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
		.replace(/\n\s*\n/g, "\n") // Remove empty lines
		.trim();
};

export const SqlHighlighter = ({
	code,
	className = "",
}: SqlHighlighterProps) => {
	const [tokens, setTokens] = useState<Token[][]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const highlightCode = async () => {
			try {
				setIsLoading(true);
				const cleanedCode = cleanQuery(code);

				const result = await codeToTokens(cleanedCode, {
					lang: "sql",
					theme: "github-light",
				});

				setTokens(result.tokens);
			} catch (error) {
				console.error("Failed to highlight SQL:", error);
				// Fallback to plain text tokens
				const lines = cleanQuery(code).split("\n");
				setTokens(lines.map((line) => [{ content: line }]));
			} finally {
				setIsLoading(false);
			}
		};

		highlightCode();
	}, [code]);

	if (isLoading) {
		return (
			<div className={`rounded-lg border bg-muted/20 p-4 ${className}`}>
				<div className="animate-pulse">
					<div className="mb-2 h-4 w-3/4 rounded bg-muted" />
					<div className="mb-2 h-4 w-1/2 rounded bg-muted" />
					<div className="h-4 w-2/3 rounded bg-muted" />
				</div>
			</div>
		);
	}

	return (
		<div className={`rounded-lg border bg-muted/20 p-4 ${className}`}>
			<pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
				{tokens.map((line, lineIndex) => (
					<div key={`sql-line-${lineIndex}-${line.length}`}>
						{line.map((token, tokenIndex) => (
							<span
								key={`sql-token-${lineIndex}-${tokenIndex}-${token.content.slice(0, 10)}`}
								style={{
									color: token.color,
									fontStyle: token.fontStyle === 1 ? "italic" : "normal",
									fontWeight: token.fontStyle === 2 ? "bold" : "normal",
								}}
							>
								{token.content}
							</span>
						))}
						{lineIndex < tokens.length - 1 && "\n"}
					</div>
				))}
			</pre>
		</div>
	);
};
