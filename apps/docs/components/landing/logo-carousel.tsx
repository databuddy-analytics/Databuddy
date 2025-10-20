'use client';

import { AnimatePresence, motion } from 'motion/react';
// import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

// const RE_WWW_PREFIX = /^www\./;

interface Logo {
	id: number;
	name: string;
	src?: string;
}

interface LogoColumnProps {
	logos: Logo[];
	columnIndex: number;
	currentTime: number;
	isLast: boolean;
}

function LogoColumn({
	logos,
	columnIndex,
	currentTime,
	isLast,
}: LogoColumnProps) {
	const CYCLE_DURATION = 3600;
	const columnDelay = columnIndex * 200;
	const adjustedTime =
		(currentTime + columnDelay) % (CYCLE_DURATION * logos.length);
	const currentIndex = Math.floor(adjustedTime / CYCLE_DURATION);
	const currentLogo = logos[currentIndex];

	// const [imgError, setImgError] = useState(false);

	// const getHostnameFromUrl = (url: string): string => {
	// 	try {
	// 		const u = new URL(url);
	// 		return u.hostname.replace(RE_WWW_PREFIX, '');
	// 	} catch {
	// 		return '';
	// 	}
	// };

	// const faviconSrc = currentLogo.src
	// 	? `https://icons.duckduckgo.com/ip3/${getHostnameFromUrl(currentLogo.src)}.ico`
	// 	: '';

	// const showFavicon = Boolean(faviconSrc) && !imgError;

	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className={`relative h-14 w-28 overflow-hidden rounded bg-background/40 ${isLast ? '' : 'border-border/20 border-r'} sm:h-16 sm:w-36 md:h-20 md:w-52 lg:h-24 lg:w-64`}
			initial={{ opacity: 0, y: 20 }}
			transition={{
				delay: columnIndex * 0.1,
				duration: 0.5,
				ease: [0.25, 0.1, 0.25, 1],
			}}
		>
			<AnimatePresence mode="wait">
				<motion.div
					animate={{
						y: '0%',
						opacity: 1,
						transition: {
							duration: 0.5,
							ease: [0.25, 0.46, 0.45, 0.94],
						},
					}}
					className="absolute inset-0 flex items-center justify-center gap-2 px-2"
					exit={{
						y: '-15%',
						filter: 'blur(3px)',
						opacity: 0,
						transition: { duration: 0.25, ease: [0.23, 1, 0.32, 1] },
					}}
					initial={{ y: '10%', opacity: 0 }}
					key={`${currentLogo.id}-${currentIndex}`}
				>
					{currentLogo.src ? (
						<a
							aria-label={`Visit ${currentLogo.name}`}
							className="inline-flex max-w-full items-center justify-center px-1 text-foreground/80 transition-colors hover:text-foreground"
							href={currentLogo.src}
							rel="noopener"
							target="_blank"
						>
							<span className="truncate font-bold text-xs tracking-wide sm:text-sm md:text-base lg:text-lg">
								{currentLogo.name}
							</span>
						</a>
					) : (
						<span className="truncate px-1 font-bold text-xs tracking-wide sm:text-sm md:text-base lg:text-lg">
							{currentLogo.name}
						</span>
					)}
				</motion.div>
			</AnimatePresence>
		</motion.div>
	);
}

interface LogoCarouselProps {
	columns?: number;
	logos: Logo[];
}

export function LogoCarousel({ columns = 3, logos }: LogoCarouselProps) {
	const [logoColumns, setLogoColumns] = useState<Logo[][]>([]);
	const [time, setTime] = useState(0);
	const [isPaused, setIsPaused] = useState(false);
	const [reducedMotion, setReducedMotion] = useState(false);

	const distributeLogos = useCallback(
		(logoList: Logo[]) => {
			const shuffled = [...logoList].sort(() => Math.random() - 0.5);
			const result: Logo[][] = Array.from({ length: columns }, () => []);

			shuffled.forEach((logo, index) => {
				result[index % columns].push(logo);
			});

			const maxLength = Math.max(...result.map((col) => col.length));
			for (const col of result) {
				while (col.length < maxLength) {
					col.push(shuffled[Math.floor(Math.random() * shuffled.length)]);
				}
			}

			return result;
		},
		[columns]
	);

	useEffect(() => {
		setLogoColumns(distributeLogos(logos));
	}, [logos, distributeLogos]);

	useEffect(() => {
		try {
			const media = window.matchMedia('(prefers-reduced-motion: reduce)');
			setReducedMotion(media.matches);
			const listener = () => setReducedMotion(media.matches);
			media.addEventListener?.('change', listener);
			return () => media.removeEventListener?.('change', listener);
		} catch {}
	}, []);

	useEffect(() => {
		if (reducedMotion) {
			return;
		}
		if (isPaused) {
			return;
		}
		const interval = setInterval(() => {
			setTime((prev) => prev + 100);
		}, 100);
		return () => clearInterval(interval);
	}, [isPaused, reducedMotion]);

	return (
		<div
			className="relative mx-auto flex justify-center gap-0 sm:gap-1 md:gap-2 lg:gap-4"
			onMouseEnter={() => setIsPaused(true)}
			onMouseLeave={() => setIsPaused(false)}
		>
			{/* gradient edges */}
			<div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent sm:w-12" />
			<div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent sm:w-12" />
			{logoColumns.map((columnLogos, index) => (
				<LogoColumn
					columnIndex={index}
					currentTime={reducedMotion ? 0 : time}
					isLast={index === logoColumns.length - 1}
					key={`${index}-${columnLogos.map((logo) => logo.id).join('-')}`}
					logos={columnLogos}
				/>
			))}
		</div>
	);
}
