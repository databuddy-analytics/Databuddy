'use client';

// Credits to better-auth for the inspiration

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

const XIcon = () => (
	<svg
		aria-label="Twitter/X"
		className="h-5 w-5 text-muted-foreground transition-colors duration-300 group-hover:text-foreground"
		fill="currentColor"
		viewBox="0 0 24 24"
	>
		<title>Twitter/X</title>
		<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
	</svg>
);

const testimonials = [
	{
		name: 'Dominik',
		profession: 'Founder, Rivo.gg',
		link: 'https://x.com/DominikDoesDev/status/1929921951000101188',
		description: 'Hands down one of the sexiest analytic tools out there😍',
		avatar: 'dominik.jpg',
		social: <XIcon />,
	},
	{
		name: 'Bekacru',
		profession: 'Founder, Better-auth',
		description: 'this looks great!',
		avatar: 'bekacru.jpg',
	},
	{
		name: 'John Yeo',
		profession: 'Co-Founder, Autumn',
		description:
			"Actually game changing going from Framer analytics to @trydatabuddy. We're such happy customers.",
		link: 'https://x.com/johnyeo_/status/1945061131342532846',
		social: <XIcon />,
		avatar:
			'https://pbs.twimg.com/profile_images/1935046528114016256/ZDKw5J0F_400x400.jpg',
	},
	{
		name: 'Axel Wesselgren',
		profession: 'Founder, Stackster',
		description:
			'Who just switched to the best data analytics platform?\n\n Me.',
		link: 'https://x.com/axelwesselgren/status/1936670098884079755',
		social: <XIcon />,
		avatar:
			'https://pbs.twimg.com/profile_images/1937981565176344576/H-CnDlga_400x400.jpg',
	},
	{
		name: 'Max',
		profession: 'Founder, Pantom Studio',
		description: "won't lie @trydatabuddy is very easy to setup damn",
		link: 'https://x.com/Metagravity0/status/1945592294612017208',
		social: <XIcon />,
		avatar:
			'https://pbs.twimg.com/profile_images/1929548168317837312/eP97J41s_400x400.jpg',
	},
	{
		name: 'Ahmet Kilinc',
		link: 'https://x.com/bruvimtired/status/1938972393357062401',
		social: <XIcon />,
		profession: 'Software Engineer, @mail0dotcom',
		description:
			"if you're not using @trydatabuddy then your analytics are going down the drain.",
		avatar: 'ahmet.jpg',
	},
	{
		name: 'Maze',
		profession: 'Founder, OpenCut',
		link: 'https://x.com/mazeincoding/status/1943019005339455631',
		social: <XIcon />,
		description:
			"@trydatabuddy is the only analytics i love, it's so simple and easy to use.",
		avatar: 'maze.jpg',
	},
	{
		name: 'Yassr Atti',
		profession: 'Founder, Call',
		description: 'everything you need for analytics is at @trydatabuddy 🔥',
		link: 'https://x.com/Yassr_Atti/status/1944455392018461107',
		social: <XIcon />,
		avatar: 'yassr.jpg',
	},
	{
		name: 'Ping Maxwell',
		profession: 'SWE, Better-auth',
		link: 'https://x.com/PingStruggles/status/1944862561935221168',
		social: <XIcon />,
		description:
			"Databuddy is the only analytics platform I've used that I can genuinely say is actually GDPR compliant, and an absolute beast of a product.  Worth a try!",
		avatar: 'ping.jpg',
	},
];

const CardContent = ({
	testimonial,
}: {
	testimonial: (typeof testimonials)[0];
}) => (
	<div className="group flex h-[180px] w-[280px] shrink-0 flex-col justify-between rounded-xl border border-border bg-card/70 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10 sm:h-[200px] sm:w-[350px] md:h-[220px] md:w-[420px]">
		<p className="text-pretty px-4 pt-4 font-light text-foreground text-sm tracking-tight sm:px-5 sm:pt-5 sm:text-base md:px-6 md:pt-6 md:text-lg">
			&quot;{testimonial.description}&quot;
		</p>
		<div className="flex h-[60px] w-full items-center gap-1 border-border border-t bg-card/20 sm:h-[65px] md:h-[70px]">
			<div className="flex w-full items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4 md:px-6">
				<Avatar className="h-8 w-8 border border-border sm:h-9 sm:w-9 md:h-10 md:w-10">
					<AvatarImage
						src={testimonial.avatar.length > 2 ? testimonial.avatar : ''}
					/>
					<AvatarFallback className="bg-muted text-muted-foreground text-xs sm:text-sm">
						{testimonial.avatar}
					</AvatarFallback>
				</Avatar>
				<div className="flex flex-1 flex-col gap-0">
					<h5 className="font-medium text-foreground text-sm sm:text-base">
						{testimonial.name}
					</h5>
					<p className="mt-[-2px] truncate text-muted-foreground text-xs sm:text-sm">
						{testimonial.profession}
					</p>
				</div>
			</div>
			{testimonial.social && (
				<>
					<div className="h-full w-[1px] bg-border" />
					<div className="flex h-full w-[50px] items-center justify-center sm:w-[60px] md:w-[70px]">
						{testimonial.social}
					</div>
				</>
			)}
		</div>
	</div>
);

function TestimonialCard({
	testimonial,
}: {
	testimonial: (typeof testimonials)[0];
}) {
	if (testimonial.link) {
		return (
			<Link className="block" href={testimonial.link} target="_blank">
				<CardContent testimonial={testimonial} />
			</Link>
		);
	}

	return <CardContent testimonial={testimonial} />;
}

function SlidingTestimonials({
	testimonials: rowTestimonials,
	reverse = false,
}: {
	testimonials: typeof testimonials;
	reverse?: boolean;
}) {
	const duplicatedTestimonials = new Array(15).fill(rowTestimonials).flat();

	return (
		<div className="group relative flex gap-5 overflow-hidden">
			<div
				className="flex shrink-0 gap-5 group-hover:[animation-play-state:paused]"
				style={{
					animation: reverse
						? 'slide-right 120s linear infinite'
						: 'slide-left 120s linear infinite',
				}}
			>
				{duplicatedTestimonials.map((testimonial, index) => (
					<TestimonialCard
						key={`${testimonial.name}-${index}`}
						testimonial={testimonial}
					/>
				))}
			</div>
		</div>
	);
}

export default function Testimonials() {
	return (
		<>
			<style>{`
				@keyframes slide-left {
					from { transform: translateX(0%); }
					to { transform: translateX(-50%); }
				}
				@keyframes slide-right {
					from { transform: translateX(-50%); }
					to { transform: translateX(0%); }
				}
			`}</style>

			<div className="relative bg-gradient-to-b from-muted/20 to-muted/50 py-12 sm:py-16">
				{/* Section header */}
				<div className="px-4 pb-8 sm:px-6 sm:pb-12 md:px-8">
					<div className="mb-2 flex items-center gap-3 sm:gap-4">
						<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 sm:h-10 sm:w-10">
							<MessageCircle className="h-4 w-4 text-primary-foreground sm:h-5 sm:w-5" />
						</div>
						<div>
							<h2 className="font-bold text-foreground text-xl sm:text-2xl">
								What developers say
							</h2>
						</div>
					</div>
					<p className="max-w-2xl text-muted-foreground text-xs sm:text-sm">
						Trusted by over 30+ early adopters.
					</p>
				</div>

				<div
					className="flex flex-col gap-3 sm:gap-5"
					style={{
						maskImage:
							'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
					}}
				>
					<SlidingTestimonials
						testimonials={testimonials.slice(
							0,
							Math.floor(testimonials.length / 2)
						)}
					/>
					<SlidingTestimonials
						reverse
						testimonials={testimonials.slice(
							Math.floor(testimonials.length / 2)
						)}
					/>
				</div>
			</div>
		</>
	);
}
