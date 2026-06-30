"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import { useEffect, useState } from "react";

const analyticsData = [
	{
		title: "Bloated and invasive",
		content:
			"Heavy scripts that slow your site, cookie banners that kill conversions, and privacy policies nobody wants to read.",
		isActive: true,
	},
	{
		title: "Scattered across tools",
		content:
			"Analytics in one place, errors in another, feature flags somewhere else. You're paying for three tools that don't talk to each other.",
		isActive: false,
	},
	{
		title: "Complex and overwhelming",
		content:
			"Enterprise tools with 200 features when you need 10. Steep learning curves and dashboards that require a PhD to understand.",
		isActive: false,
	},
	{
		title: "Built to get more complex",
		content:
			"Start with dashboards that make sense. Six months later, you need a consultant to find anything. Setup takes weeks, not minutes.",
		isActive: false,
	},
];

export const Description = () => {
	const [currentIndex, setCurrentIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentIndex((prevIndex) => (prevIndex + 1) % analyticsData.length);
		}, 5000);

		return () => clearInterval(interval);
	}, []);

	const data = analyticsData.map((item, index) => ({
		...item,
		isActive: index === currentIndex,
	}));

	const titleVariants: Variants = {
		active: {
			opacity: 1,
			color: "var(--color-foreground)",
			transition: { duration: 0.3 },
		},
		inactive: {
			opacity: 0.4,
			color: "var(--color-muted-foreground)",
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
				ease: "easeOut",
			},
		},
		exit: {
			opacity: 0,
			y: -20,
			transition: {
				duration: 0.3,
				ease: "easeIn",
			},
		},
	};

	return (
		<div className="w-full">
			<div className="block lg:hidden">
				<div className="mb-8 text-center">
					<h2 className="mb-8 font-medium text-2xl leading-tight sm:text-3xl">
						Most Analytics Tools are
					</h2>
				</div>

				<div className="mb-6 text-center">
					<h3 className="font-medium text-foreground text-xl">
						{data[currentIndex].title}
					</h3>
				</div>

				<div className="flex min-h-[100px] items-center justify-center">
					<AnimatePresence mode="wait">
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

				<motion.p
					animate={{ opacity: 1, y: 0 }}
					className="mt-10 text-center font-medium text-base text-foreground sm:text-lg"
					initial={{ opacity: 0, y: 10 }}
					transition={{ duration: 0.4, delay: 0.2 }}
				>
					Databuddy is the opposite. One script. One dashboard. Five minutes to
					set up. Nothing to configure, nothing to maintain.
				</motion.p>
			</div>

			<div className="hidden w-full justify-center lg:flex">
				<div className="flex w-full max-w-7xl items-stretch justify-center px-8">
					<div className="flex flex-1 flex-col justify-center py-12 pr-12 xl:py-16">
						<h2 className="mb-4 font-medium text-2xl leading-tight xl:mb-6 xl:text-3xl">
							Most Analytics Tools are
						</h2>

						<div className="space-y-2 xl:space-y-3">
							{data.map((item, index) => (
								<motion.div
									animate={item.isActive ? "active" : "inactive"}
									className="cursor-pointer font-normal text-lg duration-200 hover:opacity-80 xl:text-xl"
									key={`title-${item.title}`}
									onClick={() => setCurrentIndex(index)}
									variants={titleVariants}
								>
									{item.title}
								</motion.div>
							))}
						</div>

						<motion.p
							animate={{ opacity: 1, y: 0 }}
							className="mt-8 max-w-md font-medium text-base text-foreground xl:text-lg"
							initial={{ opacity: 0, y: 10 }}
							transition={{ duration: 0.4, delay: 0.2 }}
						>
							Databuddy is the opposite. One script. One dashboard. Five minutes
							to set up. Nothing to configure, nothing to maintain.
						</motion.p>
					</div>

					<div className="-mt-8 w-px shrink-0 self-stretch bg-border lg:-mt-12" />

					<div className="flex flex-1 flex-col justify-center py-12 pl-12 xl:py-16">
						<div className="flex items-center">
							<AnimatePresence mode="wait">
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
