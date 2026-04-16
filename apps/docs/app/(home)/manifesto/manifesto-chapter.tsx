import { ManifestoBlocks } from "./manifesto-blocks";
import type { ManifestoChapter as ManifestoChapterData } from "./manifesto-data";

export function ManifestoChapter({
	chapter,
}: {
	chapter: ManifestoChapterData;
}) {
	return (
		<section
			aria-labelledby={`${chapter.id}-heading`}
			className="border-border border-t"
			id={chapter.id}
		>
			<div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
				<div className="mb-8">
					<span
						aria-hidden="true"
						className="mb-3 block font-mono text-muted-foreground/40 text-sm tabular-nums"
					>
						{chapter.number}
					</span>
					<h2
						className="text-balance font-semibold text-2xl sm:text-3xl lg:text-4xl"
						id={`${chapter.id}-heading`}
					>
						{chapter.title}
					</h2>
				</div>
				<ManifestoBlocks blocks={chapter.blocks} />
			</div>
		</section>
	);
}
