'use client';

// Credits to better-auth for the inspiration

import { XLogoIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import type { ReactElement } from 'react';
import {
	Marquee,
	MarqueeContent,
	MarqueeFade,
	MarqueeItem,
} from '@/components/ui/kibo-ui/marquee';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

const testimonials = [
	{
		name: 'Dominik',
		profession: 'Founder, Rivo.gg',
		link: 'https://x.com/DominikDoesDev/status/1929921951000101188',
		description: 'Hands down one of the sexiest analytic tools out there😍',
		avatar: 'dominik.jpg',
		social: null,
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
		social: null,
		avatar:
			'https://pbs.twimg.com/profile_images/1935046528114016256/ZDKw5J0F_400x400.jpg',
	},
	{
		name: 'Axel Wesselgren',
		profession: 'Founder, Stackster',
		description:
			'Who just switched to the best data analytics platform?\n\n Me.',
		link: 'https://x.com/axelwesselgren/status/1936670098884079755',
		social: null,
		avatar:
			'https://pbs.twimg.com/profile_images/1937981565176344576/H-CnDlga_400x400.jpg',
	},
	{
		name: 'Max',
		profession: 'Founder, Pantom Studio',
		description: "won't lie @trydatabuddy is very easy to setup damn",
		link: 'https://x.com/Metagravity0/status/1945592294612017208',
		social: null,
		avatar:
			'https://pbs.twimg.com/profile_images/1929548168317837312/eP97J41s_400x400.jpg',
	},
	{
		name: 'Ahmet Kilinc',
		link: 'https://x.com/bruvimtired/status/1938972393357062401',
		social: null,
		profession: 'Software Engineer, @mail0dotcom',
		description:
			"if you're not using @trydatabuddy then your analytics are going down the drain.",
		avatar: 'ahmet.jpg',
	},
	{
		name: 'Maze',
		profession: 'Founder, OpenCut',
		link: 'https://x.com/mazeincoding/status/1943019005339455631',
		social: null,
		description: '@trydatabuddy is the only analytics i love.',
		avatar: 'maze.jpg',
	},
	{
		name: 'Yassr Atti',
		profession: 'Founder, Call',
		description: 'everything you need for analytics is at @trydatabuddy 🔥',
		link: 'https://x.com/Yassr_Atti/status/1944455392018461107',
		social: null,
		avatar: 'yassr.jpg',
	},
	{
		name: 'Ping Maxwell',
		profession: 'SWE, Better-auth',
		link: 'https://x.com/PingStruggles/status/194486256193522168',
		social: null,
		description:
			"Databuddy is the only analytics platform I've used that I can genuinely say is actually GDPR compliant, and an absolute beast of a product.  Worth a try!",
		avatar: 'ping.jpg',
	},
	{
		name: 'Fynn',
		profession: 'Founder, Studiis',
		description:
			"it's actually such a upgrade to switch from posthog to @trydatabuddy",
		link: 'https://x.com/_fqnn_/status/1955577969189306785',
		social: null,
		avatar:
			'https://pbs.twimg.com/profile_images/1419542734482903041/q7f5jbPq_400x400.jpg',
	},
];

function getNameInitial(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) {
		return '?';
	}
	return trimmed.charAt(0).toUpperCase();
}

function TestimonialCardContent({
	testimonial,
}: {
	testimonial: (typeof testimonials)[number];
}): ReactElement {
	const socialIcon = testimonial.link?.includes('x.com') ? (
		<span
			aria-hidden
			className="text-muted-foreground transition-colors duration-300 group-hover:text-foreground"
		>
			<XLogoIcon className="h-4 w-4 sm:h-5 sm:w-5" weight="duotone" />
		</span>
	) : null;

	return (
		<div className="group relative flex h-[190px] w-[280px] shrink-0 flex-col justify-between rounded border border-border bg-card/70 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10 sm:h-[210px] sm:w-[320px] md:h-[230px] md:w-[350px] lg:h-[250px] lg:w-[400px]">
			<p className="text-pretty px-3 pt-3 font-light text-foreground text-sm leading-relaxed tracking-tight sm:px-4 sm:pt-4 sm:text-base md:px-5 md:pt-5 md:text-lg lg:px-6 lg:pt-6">
				"{testimonial.description}"
			</p>
			<div className="flex h-[55px] w-full items-center gap-1 border-border border-t bg-card/20 sm:h-[60px] md:h-[65px] lg:h-[70px]">
				<div className="flex w-full items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 md:gap-4 md:px-5 md:py-4 lg:px-6">
					<Avatar className="h-8 w-8 border border-border sm:h-9 sm:w-9 md:h-10 md:w-10 lg:h-11 lg:w-11">
						<AvatarImage
							src={testimonial.avatar.length > 2 ? testimonial.avatar : ''}
						/>
						<AvatarFallback className="bg-muted text-muted-foreground text-xs sm:text-sm">
							{getNameInitial(testimonial.name)}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-1 flex-col gap-0">
						<h5 className="font-medium text-foreground text-xs sm:text-sm md:text-base">
							{testimonial.name}
						</h5>
						<p className="mt-[-1px] truncate text-muted-foreground text-xs sm:text-sm">
							{testimonial.profession}
						</p>
					</div>
				</div>
				{socialIcon ? (
					<>
						<div className="h-full w-[1px] bg-border" />
						<div className="flex h-full w-[45px] items-center justify-center sm:w-[55px] md:w-[65px] lg:w-[75px]">
							{socialIcon}
						</div>
					</>
				) : null}
			</div>

			<div className="pointer-events-none absolute inset-0">
				<div className="absolute top-0 left-0 h-2 w-2">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
				</div>
				<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
				</div>
				<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
				</div>
				<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
				</div>
			</div>
		</div>
	);
}

function TestimonialCard({
	testimonial,
}: {
	testimonial: (typeof testimonials)[number];
}): ReactElement {
	if (testimonial.link) {
		return (
			<Link
				className="block"
				href={testimonial.link}
				rel="noopener noreferrer"
				target="_blank"
			>
				<TestimonialCardContent testimonial={testimonial} />
			</Link>
		);
	}

	return <TestimonialCardContent testimonial={testimonial} />;
}

function SlidingTestimonials({
	testimonials: rowTestimonials,
	reverse = false,
}: {
	testimonials: typeof testimonials;
	reverse?: boolean;
}): ReactElement {
	return (
		<Marquee className="relative w-full [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]">
			<MarqueeFade side="left" />
			<MarqueeFade side="right" />
			<MarqueeContent
				direction={reverse ? 'right' : 'left'}
				gradient={false}
				pauseOnClick
				pauseOnHover
				speed={50}
			>
				{rowTestimonials.map((t) => (
					<MarqueeItem key={`${t.name}-${t.profession}${reverse ? '-r' : ''}`}>
						<TestimonialCard testimonial={t} />
					</MarqueeItem>
				))}
			</MarqueeContent>
		</Marquee>
	);
}

export default function Testimonials(): ReactElement {
	return (
		<div className="relative max-w-full">
			{/* Header Section */}
			<div className="mb-6 px-4 text-center sm:mb-8 sm:px-6 md:px-8 lg:mb-12">
				<h2 className="mb-3 font-medium text-lg leading-tight sm:mb-4 sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl">
					What developers are saying
				</h2>
				<p className="mx-auto max-w-2xl px-2 text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
					Join thousands of developers who trust Databuddy for their analytics
					needs
				</p>
			</div>

			{/* Testimonials Marquee */}
			<div className="max-w-full overflow-x-hidden">
				<div className="flex flex-col gap-3 sm:gap-4 lg:gap-5">
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
		</div>
	);
}
