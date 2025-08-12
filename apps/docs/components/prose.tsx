import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

interface ProseProps extends ComponentPropsWithoutRef<'article'> {
	html: string;
}

export function Prose({ children, html, className }: ProseProps) {
	return (
		<article
			className={cn(
				'prose dark:prose-invert mx-auto max-w-none prose-p:text-justify prose-h2:font-semibold prose-a:text-blue-600 prose-h1:text-xl',
				className
			)}
		>
			{/** biome-ignore lint/security/noDangerouslySetInnerHtml: Needed to render markdown */}
			{html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : children}
		</article>
	);
}
