import type { ComponentPropsWithoutRef } from "react";
import sanitizeHtml from "sanitize-html";
import { cn } from "@/lib/utils";

interface ProseProps extends ComponentPropsWithoutRef<"article"> {
	html: string;
}

const OPTIMIZED_IMAGE_HOSTS = new Set([
	"pw-static-cdn.com",
	"images.marblecms.com",
	"media.marblecms.com",
]);
const APEX_ORIGIN_REGEX = /^https?:\/\/databuddy\.cc(?=[/?#]|$)/;
const TABLE_OPEN_REGEX = /<table\b/g;
const TABLE_CLOSE_REGEX = /<\/table>/g;

function toOptimizedImageSrc(src: string) {
	if (!URL.canParse(src)) {
		return src;
	}
	const { hostname, protocol } = new URL(src);
	if (protocol !== "https:" || !OPTIMIZED_IMAGE_HOSTS.has(hostname)) {
		return src;
	}
	return `/_next/image?url=${encodeURIComponent(src)}&w=1200&q=75`;
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "del", "ins"],
	allowedAttributes: {
		"*": ["class", "id", "title", "lang", "dir", "aria-*", "data-*"],
		a: ["href", "name", "rel", "hreflang"],
		img: ["src", "srcset", "alt", "width", "height", "loading", "decoding"],
		ol: ["start", "reversed", "type"],
		td: ["colspan", "rowspan"],
		th: ["colspan", "rowspan", "scope"],
		time: ["datetime"],
	},
	transformTags: {
		h1: "h2",
		a: (tagName, attribs) => ({
			tagName,
			attribs: attribs.href
				? {
						...attribs,
						href: attribs.href.replace(
							APEX_ORIGIN_REGEX,
							"https://www.databuddy.cc"
						),
					}
				: attribs,
		}),
		img: (tagName, attribs) => ({
			tagName,
			attribs: attribs.src
				? { ...attribs, src: toOptimizedImageSrc(attribs.src) }
				: attribs,
		}),
	},
};

export function Prose({ children, html, className }: ProseProps) {
	const sanitized = html
		? sanitizeHtml(html, SANITIZE_OPTIONS)
				.replace(TABLE_OPEN_REGEX, '<div class="overflow-x-auto"><table')
				.replace(TABLE_CLOSE_REGEX, "</table></div>")
		: "";
	return (
		<article
			className={cn(
				"dark:prose-invert",
				"max-w-none",
				"prose",
				"py-2",
				"prose-headings:font-semibold",
				"prose-headings:text-foreground",
				"prose-headings:tracking-tight",
				"prose-h2:text-2xl",
				"sm:prose-h2:text-3xl",
				"prose-h3:text-xl",
				"sm:prose-h3:text-2xl",
				"prose-p:leading-relaxed",
				"prose-p:text-base",
				"prose-p:text-muted-foreground",
				"prose-a:text-primary",
				"prose-a:underline-offset-2",
				"hover:prose-a:underline",
				"prose-li:marker:text-foreground/60",
				"prose-ol:my-4",
				"prose-ul:my-4",
				"prose-img:rounded",
				"prose-pre:overflow-x-auto",
				"prose-table:border-border",
				"prose-blockquote:border-l-2",
				"prose-blockquote:border-border",
				"prose-blockquote:text-muted-foreground",
				"prose-hr:border-border",
				className
			)}
		>
			{sanitized ? (
				<div dangerouslySetInnerHTML={{ __html: sanitized }} />
			) : (
				children
			)}
		</article>
	);
}
