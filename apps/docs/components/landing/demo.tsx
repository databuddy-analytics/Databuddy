'use client';

import { ArrowsOutSimple as ArrowsOutSimpleIcon } from '@phosphor-icons/react';
import { useRef } from 'react';

export default function DemoContainer() {
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const handleFullscreen = () => {
		if (iframeRef.current?.requestFullscreen) {
			iframeRef.current.requestFullscreen();
		}
	};

	const dotPattern =
		"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 1'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E";

	return (
		<div className="mx-auto mt-24 mb-24 w-full max-w-7xl px-8">
			<div className="group relative bg-background/80 p-2 shadow-2xl backdrop-blur-sm">
				<div
					className="-top-px absolute inset-x-0 h-px opacity-30"
					style={{
						backgroundImage: `url("${dotPattern}")`,
						WebkitMaskImage:
							'linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						maskImage:
							'linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						marginLeft: '-4rem',
						marginRight: '-4rem',
					}}
				/>

				<div
					className="-left-px absolute inset-y-0 w-px opacity-30"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 4'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E")`,
						WebkitMaskImage:
							'linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						maskImage:
							'linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						marginTop: '-4rem',
						marginBottom: '-4rem',
					}}
				/>
				<div
					className="-right-px absolute inset-y-0 w-px opacity-30"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 4'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E")`,
						WebkitMaskImage:
							'linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						maskImage:
							'linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						marginTop: '-4rem',
						marginBottom: '-4rem',
					}}
				/>

				<div
					className="absolute inset-x-0 h-px opacity-30"
					style={{
						bottom: '-1px',
						backgroundImage: `url("${dotPattern}")`,
						WebkitMaskImage:
							'linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						maskImage:
							'linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)',
						marginLeft: '-4rem',
						marginRight: '-4rem',
					}}
				/>

				<iframe
					allowFullScreen
					className="h-[500px] w-full rounded border-0 bg-gradient-to-b from-transparent to-background grayscale sm:h-[600px] lg:h-[700px]"
					loading="lazy"
					ref={iframeRef}
					src="https://app.databuddy.cc/demo/OXmNQsViBT-FOS_wZCTHc"
					title="Databuddy Demo Dashboard"
				/>

				{/* Fullscreen Button & Overlay */}
				<button
					aria-label="Open demo in fullscreen"
					className="absolute inset-2 flex items-center justify-center rounded bg-background/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
					onClick={handleFullscreen}
					type="button"
				>
					<div className="flex items-center gap-2 rounded border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm transition-colors hover:bg-card">
						<ArrowsOutSimpleIcon
							className="h-4 w-4 text-foreground"
							weight="fill"
						/>
						<span className="text-foreground">Click to view fullscreen</span>
					</div>
				</button>
			</div>
		</div>
	);
}
