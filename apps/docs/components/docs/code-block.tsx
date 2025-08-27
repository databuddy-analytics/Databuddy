import type * as React from 'react';
import { cache } from 'react';
import { createHighlighter } from 'shiki';
import { SciFiCard } from '@/components/scifi-card';
import { cn } from '@/lib/utils';

interface CodeBlockProps extends React.ComponentProps<'div'> {
	language?: string;
	filename?: string;
	code?: string;
	children?: React.ReactNode;
}

// Create a singleton highlighter instance following Shiki best practices
const getShikiHighlighter = cache(async () => {
	return await createHighlighter({
		themes: ['github-dark', 'github-light'],
		langs: [
			'typescript',
			'javascript',
			'tsx',
			'jsx',
			'bash',
			'shell',
			'sh',
			'html',
			'css',
			'json',
			'python',
			'go',
			'rust',
			'sql',
			'yaml',
			'xml',
			'markdown',
			'plaintext',
		],
	});
});

async function CodeBlock({
	children,
	className,
	language = 'text',
	filename,
	code,
}: CodeBlockProps) {
	const content = code || children;

	if (!content || typeof content !== 'string') {
		return null;
	}

	const highlighter = await getShikiHighlighter();
	let highlightedCode: string | null = null;

	// Only attempt syntax highlighting for supported languages
	if (language !== 'text' && language !== 'plaintext') {
		try {
			highlightedCode = highlighter.codeToHtml(content, {
				lang: language,
				themes: {
					light: 'github-light',
					dark: 'github-dark',
				},
				defaultColor: false,
				transformers: [
					{
						pre(node) {
							// Remove default styling to use our own
							node.properties.style = '';
							node.properties.tabindex = '-1';
						},
						code(node) {
							node.properties.style = '';
						},
					},
				],
			});
		} catch {
			// Fallback to plain text if language is not supported
			console.warn(
				`Shiki: Language "${language}" not supported, falling back to plain text`
			);
			highlightedCode = null;
		}
	}

	return (
		<SciFiCard
			className="my-4 w-full rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/70"
			cornerOpacity="opacity-60"
			variant="primary"
		>
			{/* Header */}
			{(language !== 'text' || filename) && (
				<div className="flex items-center justify-between border-border border-b bg-muted/30 px-4 py-2.5">
					<div className="flex items-center gap-3">
						{filename && (
							<span className="font-medium text-foreground text-sm">
								{filename}
							</span>
						)}
						{language !== 'text' && (
							<span className="rounded bg-primary/10 px-2 py-0.5 font-medium font-mono text-primary text-xs uppercase tracking-wide">
								{language}
							</span>
						)}
					</div>
				</div>
			)}

			{/* Code content */}
			<div className="relative">
				{highlightedCode ? (
					<div
						className={cn(
							'overflow-x-auto font-mono text-sm leading-relaxed',
							'[&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:p-4 [&>pre]:font-mono [&>pre]:text-sm [&>pre]:leading-relaxed',
							'[&>pre>code]:block [&>pre>code]:w-full [&>pre>code]:font-mono [&>pre>code]:text-sm [&>pre>code]:leading-relaxed',
							'[&_.line]:min-h-[1.25rem] [&_.line]:px-0',
							className
						)}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: Required for syntax highlighting
						dangerouslySetInnerHTML={{ __html: highlightedCode }}
					/>
				) : (
					<pre
						className={cn(
							'overflow-x-auto p-4 font-mono text-foreground text-sm leading-relaxed',
							'[&>code]:block [&>code]:w-full [&>code]:p-0 [&>code]:text-inherit',
							className
						)}
						tabIndex={-1}
					>
						<code className="font-mono">{content}</code>
					</pre>
				)}
			</div>
		</SciFiCard>
	);
}

interface InlineCodeProps extends React.ComponentProps<'code'> {}

function InlineCode({ className, ...props }: InlineCodeProps) {
	return (
		<code
			className={cn(
				'relative rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-medium font-mono text-primary text-sm',
				className
			)}
			{...props}
		/>
	);
}

export { CodeBlock, InlineCode };
