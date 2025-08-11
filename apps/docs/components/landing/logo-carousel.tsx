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
}

function LogoColumn({ logos, columnIndex, currentTime }: LogoColumnProps) {
	const CYCLE_DURATION = 2000;
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
			className="relative h-16 w-40 overflow-hidden border-r sm:h-20 md:h-24 md:w-64 lg:w-72"
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
							duration: 0.6,
							ease: [0.25, 0.46, 0.45, 0.94],
						},
					}}
					className="absolute inset-0 flex items-center justify-center gap-2"
					exit={{
						y: '-20%',
						filter: 'blur(3px)',
						opacity: 0,
						transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] },
					}}
					initial={{ y: '10%', opacity: 0 }}
					key={`${currentLogo.id}-${currentIndex}`}
				>
					{/* {showFavicon ? (
						<Image
							alt={`${currentLogo.name} favicon`}
							className="h-6 w-6"
							height={24}
							loading="eager"
							onError={() => setImgError(true)}
							priority
							sizes="24px"
							src={faviconSrc}
							width={24}
						/>
					) : null} */}
					<span className="truncate font-bold text-base sm:text-xl md:text-2xl">
						{currentLogo.name}
					</span>
				</motion.div>
			</AnimatePresence>
		</motion.div>
	);
}

interface LogoCarouselProps {
	columns?: number;
	logos: Logo[];
}

export function LogoCarousel({ columns = 2, logos }: LogoCarouselProps) {
	const [logoColumns, setLogoColumns] = useState<Logo[][]>([]);
	const [time, setTime] = useState(0);

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
		const interval = setInterval(() => {
			setTime((prev) => prev + 100);
		}, 100);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="flex justify-center gap-4">
			{logoColumns.map((columnLogos, index) => (
				<LogoColumn
					columnIndex={index}
					currentTime={time}
					key={`${index}-${columnLogos.map((logo) => logo.id).join('-')}`}
					logos={columnLogos}
				/>
			))}
		</div>
	);
}
