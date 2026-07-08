"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { Link } from "@/hooks/use-links";
import { Spinner } from "@databuddy/ui";
import { LinkRow } from "./link-item";

const ESTIMATED_ROW_HEIGHT = 65;

interface VirtualizedLinksListProps {
	fetchNextPage: () => void;
	foldersById?: Map<string, string>;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	links: Link[];
	onDelete: (linkId: string) => void;
	onEdit: (link: Link) => void;
	onShowQr: (link: Link) => void;
	scrollRef: RefObject<HTMLElement | null>;
}

export function VirtualizedLinksList({
	links,
	foldersById,
	onEdit,
	onDelete,
	onShowQr,
	scrollRef,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: VirtualizedLinksListProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const [scrollMargin, setScrollMargin] = useState(0);

	useLayoutEffect(() => {
		const scrollEl = scrollRef.current;
		const listEl = listRef.current;
		if (!(scrollEl && listEl)) {
			return;
		}
		setScrollMargin(
			listEl.getBoundingClientRect().top -
				scrollEl.getBoundingClientRect().top +
				scrollEl.scrollTop
		);
	}, [scrollRef]);

	const virtualizer = useVirtualizer({
		count: links.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: 8,
		scrollMargin,
	});

	const virtualItems = virtualizer.getVirtualItems();
	const lastItem = virtualItems.at(-1);

	useEffect(() => {
		if (
			lastItem &&
			lastItem.index >= links.length - 1 &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			fetchNextPage();
		}
	}, [lastItem, links.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

	return (
		<div>
			<div
				className="relative w-full"
				ref={listRef}
				style={{ height: `${virtualizer.getTotalSize()}px` }}
			>
				{virtualItems.map((virtualItem) => {
					const link = links[virtualItem.index];
					if (!link) {
						return null;
					}
					return (
						<div
							className="absolute top-0 left-0 w-full border-border/60 border-b"
							data-index={virtualItem.index}
							key={link.id}
							ref={virtualizer.measureElement}
							style={{
								transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
							}}
						>
							<LinkRow
								folderName={
									link.folderId ? foldersById?.get(link.folderId) : undefined
								}
								link={link}
								onDelete={onDelete}
								onEdit={onEdit}
								onShowQr={onShowQr}
							/>
						</div>
					);
				})}
			</div>
			{isFetchingNextPage && (
				<div className="flex items-center justify-center py-4">
					<Spinner className="size-4 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
