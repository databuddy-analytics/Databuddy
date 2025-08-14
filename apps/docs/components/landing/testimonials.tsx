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
		link: 'https://x.com/PingStruggles/status/1944862561935221168',
		social: null,
		description:
			"Databuddy is the only analytics platform I've used that I can genuinely say is actually GDPR compliant, and an absolute beast of a product.  Worth a try!",
		avatar: 'ping.jpg',
	},
	{
		name: 'Fynn',
		profession: 'Founder, Studiis',
		description:
			'it’s actually such a upgrade to switch from posthog to @trydatabuddy',
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
			<XLogoIcon className="h-5 w-5" weight="duotone" />
		</span>
	) : null;

	return (
		<div className="group relative flex h-[200px] w-[300px] shrink-0 flex-col justify-between rounded border border-border bg-card/70 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10 sm:h-[220px] sm:w-[350px] lg:h-[240px] lg:w-[400px]">
			<p className="text-pretty px-4 pt-4 font-light text-foreground text-sm leading-relaxed tracking-tight sm:px-5 sm:pt-5 sm:text-base lg:px-6 lg:pt-6 lg:text-base">
				"{testimonial.description}"
			</p>
			<div className="flex h-[65px] w-full items-center gap-1 border-border border-t bg-card/20 sm:h-[70px] lg:h-[75px]">
				<div className="flex w-full items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:px-6">
					<Avatar className="h-9 w-9 border border-border sm:h-10 sm:w-10 lg:h-11 lg:w-11">
						<AvatarImage
							src={testimonial.avatar.length > 2 ? testimonial.avatar : ''}
						/>
						<AvatarFallback className="bg-muted text-muted-foreground text-xs sm:text-sm">
							{getNameInitial(testimonial.name)}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-1 flex-col gap-0">
						<h5 className="font-medium text-foreground text-sm sm:text-base lg:text-base">
							{testimonial.name}
						</h5>
						<p className="mt-[-2px] truncate text-muted-foreground text-xs sm:text-sm lg:text-sm">
							{testimonial.profession}
						</p>
					</div>
				</div>
				{socialIcon ? (
					<>
						<div className="h-full w-[1px] bg-border" />
						<div className="flex h-full w-[55px] items-center justify-center sm:w-[65px] lg:w-[75px]">
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
		<Marquee className="relative">
			<MarqueeFade side="left" />
			<MarqueeFade side="right" />
			<MarqueeContent
				direction={reverse ? 'right' : 'left'}
				gradient={false}
				pauseOnClick
				pauseOnHover
				speed={30}
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
		<div className="relative w-full">
			{/* Header Section */}
			<div className="mb-8 px-4 text-center sm:px-6 lg:mb-12 lg:px-8">
				<h2 className="mb-4 font-medium text-2xl leading-tight sm:text-3xl lg:text-4xl xl:text-5xl">
					What developers are saying
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Join thousands of developers who trust Databuddy for their analytics
					needs
				</p>
			</div>

			{/* Testimonials Marquee */}
			<div className="flex flex-col gap-4 px-4 sm:px-0 lg:gap-5">
				<SlidingTestimonials
					testimonials={testimonials.slice(
						0,
						Math.floor(testimonials.length / 2)
					)}
				/>
				<SlidingTestimonials
					reverse
					testimonials={testimonials.slice(Math.floor(testimonials.length / 2))}
				/>
			</div>
		</div>
	);
}
