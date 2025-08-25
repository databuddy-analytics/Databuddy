'use client';

import { HeartIcon, PaletteIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';

interface Sponsor {
	id: string;
	name: string;
	logo: string;
	website: string;
	tier: 'platinum' | 'gold' | 'silver' | 'bronze';
}

interface NonCodeContributor {
	id: string;
	name: string;
	role: string;
	contribution: string;
	avatar?: string;
	website?: string;
}

const sponsors: Sponsor[] = [
	{
		id: 'neon',
		name: 'Neon',
		logo: '/neon.svg',
		website: 'https://neon.tech',
		tier: 'bronze',
	},
	{
		id: 'upstash',
		name: 'Upstash',
		logo: '/upstash.svg',
		website: 'https://upstash.com',
		tier: 'silver',
	},
];

const nonCodeContributors: NonCodeContributor[] = [
	{
		id: 'dazai',
		name: 'Dazai',
		role: 'design engineer @ searchable',
		contribution: 'Design systems, UI/UX, and more',
		avatar:
			'https://pbs.twimg.com/profile_images/1945002665005416448/8m0GEHLP_400x400.jpg',
		website: 'https://deewakar.info',
	},
	{
		id: 'aaron-mahlke',
		name: 'Aaron Mahlke',
		role: 'Founding Design Engineer @ mail0',
		contribution: 'Branding, Designs, and more',
		avatar:
			'https://pbs.twimg.com/profile_images/1900513355447603200/mDqwmkZT_400x400.jpg',
		website: 'https://mahlke.design',
	},
	{
		id: 'dominik-content',
		name: 'Dominik Koch',
		role: 'SWE @ MarbleCMS',
		contribution: 'Content, Blogs, Social Media, and more',
		avatar:
			'https://pbs.twimg.com/profile_images/1933961142457581568/i2Y0u0lV_400x400.jpg',
		website: '#',
	},
];

function FlipCard() {
	return (
		<motion.div
			className="group relative h-80 w-full"
			initial="initial"
			style={{ perspective: 1000 }}
			whileHover="flipped"
		>
			<motion.div
				className="relative h-full w-full"
				style={{ transformStyle: 'preserve-3d' }}
				transition={{ duration: 0.7, ease: 'easeInOut' }}
				variants={{
					initial: { rotateY: 0 },
					flipped: { rotateY: 180 },
				}}
			>
				{/* Front Side - Sponsors */}
				<motion.div
					className="absolute inset-0 rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70"
					style={{ backfaceVisibility: 'hidden' }}
				>
					<div className="flex h-full flex-col items-center justify-center p-6">
						<motion.div
							animate={{ scale: 1, opacity: 1 }}
							className="mb-4 rounded-full bg-purple-500/10 p-3"
							initial={{ scale: 0.8, opacity: 0 }}
							transition={{ delay: 0.2, duration: 0.5 }}
						>
							<HeartIcon className="h-8 w-8 text-purple-500" weight="duotone" />
						</motion.div>

						<motion.h3
							animate={{ y: 0, opacity: 1 }}
							className="mb-3 text-center font-semibold text-2xl sm:text-3xl lg:text-4xl"
							initial={{ y: 20, opacity: 0 }}
							transition={{ delay: 0.3, duration: 0.5 }}
						>
							Our Sponsors
						</motion.h3>

						<motion.p
							animate={{ y: 0, opacity: 1 }}
							className="mb-6 max-w-2xl text-center text-muted-foreground text-sm sm:text-base lg:text-lg"
							initial={{ y: 20, opacity: 0 }}
							transition={{ delay: 0.4, duration: 0.5 }}
						>
							Companies supporting our mission to build privacy-first analytics
						</motion.p>

						<motion.div
							animate={{ y: 0, opacity: 1 }}
							className="mb-6 flex flex-wrap items-center justify-center gap-6"
							initial={{ y: 20, opacity: 0 }}
							transition={{ delay: 0.5, duration: 0.5 }}
						>
							{sponsors.map((sponsor, index) => (
								<motion.div
									animate={{ scale: 1, opacity: 1 }}
									initial={{ scale: 0, opacity: 0 }}
									key={sponsor.id}
									transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
								>
									<Link
										className="group/sponsor block"
										href={sponsor.website}
										rel="noopener noreferrer"
										target="_blank"
									>
										<motion.div
											className="flex h-16 w-24 items-center justify-center rounded bg-background/50 p-3 transition-all duration-300 hover:bg-background/70"
											whileHover={{ scale: 1.05 }}
											whileTap={{ scale: 0.95 }}
										>
											<Image
												alt={`${sponsor.name} logo`}
												className={`max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105 ${
													sponsor.name === 'Upstash'
														? 'dark:brightness-0 dark:invert'
														: 'brightness-0 dark:brightness-100'
												}`}
												height={48}
												src={sponsor.logo}
												width={80}
											/>
										</motion.div>
									</Link>
								</motion.div>
							))}
						</motion.div>

						<motion.div
							animate={{ y: 0, opacity: 1 }}
							initial={{ y: 20, opacity: 0 }}
							transition={{ delay: 0.8, duration: 0.5 }}
						>
							<Link
								className="text-primary text-sm hover:underline"
								href="/sponsors"
							>
								View all sponsors →
							</Link>
						</motion.div>
					</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</motion.div>

				{/* Back Side - Non-Code Contributors */}
				<motion.div
					className="absolute inset-0 rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70"
					style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
				>
					<div className="flex h-full flex-col p-4">
						{/* Header - Compact */}
						<div className="mb-4 text-center">
							<motion.div
								animate={{ scale: 1, opacity: 1 }}
								className="mb-2 inline-flex rounded-full bg-blue-500/10 p-1.5"
								initial={{ scale: 0.8, opacity: 0 }}
								transition={{ delay: 0.2, duration: 0.5 }}
							>
								<PaletteIcon
									className="h-5 w-5 text-blue-500"
									weight="duotone"
								/>
							</motion.div>

							<motion.h3
								animate={{ y: 0, opacity: 1 }}
								className="mb-1 font-semibold text-lg sm:text-xl"
								initial={{ y: 20, opacity: 0 }}
								transition={{ delay: 0.3, duration: 0.5 }}
							>
								Beyond Code
							</motion.h3>

							<motion.p
								animate={{ y: 0, opacity: 1 }}
								className="text-muted-foreground text-xs"
								initial={{ y: 20, opacity: 0 }}
								transition={{ delay: 0.4, duration: 0.5 }}
							>
								Amazing people making Databuddy better
							</motion.p>
						</div>

						{/* Contributors Grid - Constrained Height */}
						<motion.div
							animate={{ y: 0, opacity: 1 }}
							className="grid flex-1 grid-cols-1 gap-2 overflow-hidden sm:grid-cols-3"
							initial={{ y: 20, opacity: 0 }}
							transition={{ delay: 0.5, duration: 0.5 }}
						>
							{nonCodeContributors.map((contributor, index) => (
								<motion.div
									animate={{ scale: 1, opacity: 1 }}
									className="group/contributor relative flex flex-col items-center rounded border border-border/30 bg-background/20 p-4 transition-all duration-300 hover:border-border/60 hover:bg-background/40"
									initial={{ scale: 0.8, opacity: 0 }}
									key={contributor.id}
									transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
									whileHover={{ scale: 1.02 }}
								>
									{/* Avatar - Bigger */}
									<motion.div
										className="mb-3 overflow-hidden rounded-full border-2 border-border/50"
										whileHover={{ scale: 1.05 }}
									>
										<Image
											alt={contributor.name}
											className="h-12 w-12 object-cover"
											height={48}
											src={contributor.avatar || '/placeholder-avatar.png'}
											width={48}
										/>
									</motion.div>

									{/* Name - Bigger */}
									<h4 className="mb-2 text-center font-semibold text-foreground text-sm transition-colors group-hover/contributor:text-primary">
										{contributor.name}
									</h4>

									{/* Role - Bigger */}
									<div className="mb-2 text-center font-medium text-blue-500 text-xs">
										{contributor.role}
									</div>

									{/* Contribution - Bigger */}
									<p className="text-center text-muted-foreground text-xs leading-relaxed">
										{contributor.contribution}
									</p>

									{/* Mini sci-fi corners - Smaller */}
									<div className="pointer-events-none absolute inset-0">
										<div className="absolute top-0 left-0 h-0.5 w-0.5 group-hover/contributor:animate-[cornerGlitch_0.6s_ease-in-out]">
											<div className="absolute top-0 left-0.5 h-0.5 w-0.5 origin-left bg-foreground" />
											<div className="absolute top-0 left-0 h-0.5 w-0.5 origin-top bg-foreground" />
										</div>
										<div className="-scale-x-[1] absolute top-0 right-0 h-0.5 w-0.5 group-hover/contributor:animate-[cornerGlitch_0.6s_ease-in-out]">
											<div className="absolute top-0 left-0.5 h-0.5 w-0.5 origin-left bg-foreground" />
											<div className="absolute top-0 left-0 h-0.5 w-0.5 origin-top bg-foreground" />
										</div>
										<div className="-scale-y-[1] absolute bottom-0 left-0 h-0.5 w-0.5 group-hover/contributor:animate-[cornerGlitch_0.6s_ease-in-out]">
											<div className="absolute top-0 left-0.5 h-0.5 w-0.5 origin-left bg-foreground" />
											<div className="absolute top-0 left-0 h-0.5 w-0.5 origin-top bg-foreground" />
										</div>
										<div className="-scale-[1] absolute right-0 bottom-0 h-0.5 w-0.5 group-hover/contributor:animate-[cornerGlitch_0.6s_ease-in-out]">
											<div className="absolute top-0 left-0.5 h-0.5 w-0.5 origin-left bg-foreground" />
											<div className="absolute top-0 left-0 h-0.5 w-0.5 origin-top bg-foreground" />
										</div>
									</div>
								</motion.div>
							))}
						</motion.div>
					</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</motion.div>
			</motion.div>
		</motion.div>
	);
}

export default function AppreciationFlipCards() {
	return (
		<div className="text-center">
			<div className="mb-8">
				<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Appreciation Corner
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Recognizing everyone who makes Databuddy possible
				</p>
			</div>

			<div className="flex justify-center">
				<FlipCard />
			</div>

			<p className="mt-6 text-muted-foreground text-sm">
				Hover to flip the card and discover more contributors
			</p>
		</div>
	);
}
