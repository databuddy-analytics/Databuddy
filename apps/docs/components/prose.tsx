import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

interface ProseProps extends ComponentPropsWithoutRef<'article'> {
	html: string;
}

export function Prose({ children, html, className }: ProseProps) {
	return (
		<article
			className={cn(
				'dark:prose-invert',
				'max-w-none',
				'prose',
				'py-2',
				'prose-headings:font-semibold',
				'prose-headings:text-foreground',
				'prose-headings:tracking-tight',
				'prose-h1:text-3xl',
				'sm:prose-h1:text-4xl',
				'prose-h2:text-2xl',
				'sm:prose-h2:text-3xl',
				'prose-h3:text-xl',
				'sm:prose-h3:text-2xl',
				'prose-p:leading-relaxed',
				'prose-p:text-base',
				'prose-p:text-muted-foreground',
				'prose-a:text-primary',
				'prose-a:underline-offset-2',
				'hover:prose-a:underline',
				'prose-li:marker:text-foreground/60',
				'prose-ol:my-4',
				'prose-ul:my-4',
				'prose-code:bg-muted',
				'prose-code:px-1.5',
				'prose-code:py-0.5',
				'prose-code:rounded',
				'prose-code:text-foreground',
				'prose-pre:bg-muted',
				'prose-pre:rounded',
				'prose-img:rounded',
				'prose-table:border-border',
				'prose-blockquote:border-l-2',
				'prose-blockquote:border-border',
				'prose-blockquote:text-muted-foreground',
				'prose-hr:border-border',
				className
			)}
		>
			{/** biome-ignore lint/security/noDangerouslySetInnerHtml: Needed to render markdown */}
			{html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : children}
		</article>
	);
}
