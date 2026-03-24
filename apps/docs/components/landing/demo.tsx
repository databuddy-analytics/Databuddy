"use client";

import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { getDemoEmbedBaseUrl } from "@/lib/demo-embed-url";

type FullscreenElement = HTMLIFrameElement & {
	webkitRequestFullscreen?: () => Promise<void>;
	mozRequestFullScreen?: () => Promise<void>;
	msRequestFullscreen?: () => Promise<void>;
};

export default function DemoContainer({
	embedBaseUrl,
}: {
	embedBaseUrl?: string;
}) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const iframeSrc = embedBaseUrl ?? getDemoEmbedBaseUrl(null);

	const handleFullscreen = async () => {
		const element = iframeRef.current as FullscreenElement | null;
		if (!element) {
			return;
		}

		try {
			if (element.requestFullscreen) {
				await element.requestFullscreen();
			} else if (element.webkitRequestFullscreen) {
				await element.webkitRequestFullscreen();
			} else if (element.mozRequestFullScreen) {
				await element.mozRequestFullScreen();
			} else if (element.msRequestFullscreen) {
				await element.msRequestFullscreen();
			} else {
				// Fallback: open in new tab
				window.open(element.src, "_blank", "noopener,noreferrer");
			}
		} catch (error) {
			// Fullscreen was denied or failed, fallback to new tab
			console.error("Fullscreen failed:", error);
			window.open(element.src, "_blank", "noopener,noreferrer");
		}
	};

	const dotPattern =
		"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 1'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E";

	return (
		<div className="mx-auto mt-24 mb-24 w-full">
			<div className="group relative bg-background/80 p-2 shadow-2xl backdrop-blur-sm">
				<div
					className="absolute inset-x-0 -top-px h-px opacity-30"
					style={{
						backgroundImage: `url("${dotPattern}")`,
						WebkitMaskImage:
							"linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						maskImage:
							"linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						marginLeft: "-4rem",
						marginRight: "-4rem",
					}}
				/>

				<div
					className="absolute inset-y-0 -left-px w-px opacity-30"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 4'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E")`,
						WebkitMaskImage:
							"linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						maskImage:
							"linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						marginTop: "-4rem",
						marginBottom: "-4rem",
					}}
				/>
				<div
					className="absolute inset-y-0 -right-px w-px opacity-30"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 4'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E")`,
						WebkitMaskImage:
							"linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						maskImage:
							"linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						marginTop: "-4rem",
						marginBottom: "-4rem",
					}}
				/>

				<div
					className="absolute inset-x-0 h-px opacity-30"
					style={{
						bottom: "-1px",
						backgroundImage: `url("${dotPattern}")`,
						WebkitMaskImage:
							"linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						maskImage:
							"linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
						marginLeft: "-4rem",
						marginRight: "-4rem",
					}}
				/>

				<iframe
					allowFullScreen
					className="h-[500px] w-full rounded border-0 bg-linear-to-b from-transparent to-background shadow-2xl sm:h-[600px] lg:h-[700px]"
					loading="lazy"
					ref={iframeRef}
					src={iframeSrc}
					title="Databuddy Demo Dashboard"
				/>

				{/* Fullscreen/Open Button & Overlay */}
				<button
					aria-label="Open demo in fullscreen"
					className="absolute inset-2 flex items-center justify-center rounded bg-background/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
					onClick={handleFullscreen}
					type="button"
				>
					<div className="flex cursor-pointer items-center gap-2 rounded border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm duration-300 hover:bg-background/10">
						<ArrowsOutSimpleIcon
							className="size-4 text-foreground"
							weight="fill"
						/>
						<span className="text-foreground">Click to view fullscreen</span>
					</div>
				</button>
			</div>
		</div>
	);
}
