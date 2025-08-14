/**
 * Enhance HTML content with better code block styling
 */
export function enhanceCodeBlocks(html: string): string {
	let enhanced = html;

	// First handle code blocks (pre > code)
	enhanced = enhanced.replace(
		/<pre><code([^>]*)>/g,
		'<pre class="not-prose relative my-6 overflow-x-auto rounded border border-border bg-muted p-4 font-mono text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0"><code$1 class="block text-foreground">'
	);

	// Handle pre blocks without inner code tag
	enhanced = enhanced.replace(
		/<pre(?![^>]*class=.*not-prose)([^>]*)>/g,
		'<pre$1 class="not-prose relative my-6 overflow-x-auto rounded border border-border bg-muted p-4 font-mono text-sm leading-6 text-foreground">'
	);

	// Handle inline code (not inside pre blocks)
	enhanced = enhanced.replace(
		/<code(?![^>]*class=.*block)([^>]*)>/g,
		'<code$1 class="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold text-foreground">'
	);

	return enhanced;
}
