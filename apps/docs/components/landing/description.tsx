'use client';

import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useEffect, useState } from 'react';

const analyticsData = [
	{
		title: 'Bloated and Creepy',
		content:
			'Google Analytics tracks everything, slows down your site, and requires cookie banners that hurt conversion rates.',
		isActive: true,
	},
	{
		title: 'Minimal but useless',
		content:
			'Simple analytics tools give you basic metrics but lack the depth needed for meaningful business insights.',
		isActive: false,
	},
	{
		title: 'Complex Product Analysis',
		content:
			"Enterprise tools overwhelm you with features you don't need while hiding the metrics that actually matter.",
		isActive: false,
	},
];

export const Description = () => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [data, setData] = useState(analyticsData);

	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentIndex((prevIndex) => (prevIndex + 1) % data.length);
		}, 5000);

		return () => clearInterval(interval);
	}, [data.length]);

	useEffect(() => {
		setData((prevData) =>
			prevData.map((item, index) => ({
				...item,
				isActive: index === currentIndex,
			}))
		);
	}, [currentIndex]);

	const titleVariants: Variants = {
		active: {
			opacity: 1,
			color: 'var(--color-foreground)',
			transition: { duration: 0.3 },
		},
		inactive: {
			opacity: 0.4,
			color: 'var(--color-muted-foreground)',
			transition: { duration: 0.3 },
		},
	};

	const contentVariants: Variants = {
		enter: {
			opacity: 0,
			y: 20,
		},
		center: {
			opacity: 1,
			y: 0,
			transition: {
				duration: 0.4,
				ease: 'easeOut',
			},
		},
		exit: {
			opacity: 0,
			y: -20,
			transition: {
				duration: 0.3,
				ease: 'easeIn',
			},
		},
	};

	return (
		<div className="w-full">
			{/* Mobile Layout */}
			<div className="block lg:hidden">
				<div className="mb-8 text-center">
					<h2 className="mb-8 font-medium text-2xl leading-tight sm:text-3xl">
						Most Analytics Tools are
					</h2>
				</div>

				{/* Mobile Active Title */}
				<div className="mb-6 text-center">
					<h3 className="font-medium text-foreground text-xl">
						{data[currentIndex].title}
					</h3>
				</div>

				{/* Mobile Content */}
				<div className="flex min-h-[100px] items-center justify-center">
					<AnimatePresence mode="popLayout">
						<motion.div
							animate="center"
							className="max-w-md text-center text-muted-foreground text-sm leading-relaxed sm:text-base"
							exit="exit"
							initial="enter"
							key={currentIndex}
							variants={contentVariants}
						>
							{data[currentIndex].content}
						</motion.div>
					</AnimatePresence>
				</div>
			</div>

			{/* Desktop Layout */}
			<div className="hidden w-full items-center justify-center lg:flex">
				<div className="flex w-full max-w-7xl items-center justify-center px-8">
					{/* Left Column - Titles */}
					<div className="flex-1 pr-12">
						<h2 className="mb-8 font-medium text-2xl leading-tight xl:mb-12 xl:text-3xl">
							Most Analytics Tools are
						</h2>

						<div className="space-y-3 xl:space-y-4">
							{data.map((item, index) => (
								<motion.div
									animate={item.isActive ? 'active' : 'inactive'}
									className="cursor-pointer font-medium text-lg transition-colors duration-200 hover:opacity-80 xl:text-xl"
									key={`title-${item.title}`}
									onClick={() => setCurrentIndex(index)}
									variants={titleVariants}
								>
									{item.title}
								</motion.div>
							))}
						</div>
					</div>

					{/* Divider */}
					<div className="h-60 w-px flex-shrink-0 bg-border" />

					{/* Right Column - Content */}
					<div className="flex-1 pl-12">
						<div className="flex min-h-[140px] items-center xl:min-h-[180px]">
							<AnimatePresence mode="popLayout">
								<motion.div
									animate="center"
									className="max-w-md text-muted-foreground text-sm leading-relaxed xl:text-base"
									exit="exit"
									initial="enter"
									key={currentIndex}
									variants={contentVariants}
								>
									{data[currentIndex].content}
								</motion.div>
							</AnimatePresence>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
