import { SiX } from "@icons-pack/react-simple-icons";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionBullet } from "../icons/section-bullet";
import { SciFiCard } from "../scifi-card";

interface Person {
	avatar: string;
	link: string;
	name: string;
	profession: string;
}

const featured = {
	name: "Michael Chomsky",
	profession: "Founder, Rentmyheader",
	link: "https://x.com/michael_chomsky/status/2013527112699814351",
	avatar: "/michael.jpg",
	quote: [
		{ text: "Ive tried a BUNCH of analytics providers. " },
		{
			text: "Databuddy does things I didn't even know are possible.",
			highlight: true,
		},
		{ text: " So far " },
		{
			text: "10x better than anything I personally have ever tried.",
			highlight: true,
		},
	],
};

const testimonials = [
	{
		name: "John Yeo",
		profession: "Co-Founder, Autumn",
		quote:
			"Actually game changing going from Framer analytics to @trydatabuddy. We're such happy customers.",
		link: "https://x.com/johnyeo_/status/1945061131342532846",
		avatar: "/john.jpg",
	},
	{
		name: "Fynn",
		profession: "Founder, Studiis",
		quote:
			"it's actually such a upgrade to switch from posthog to @trydatabuddy",
		link: "https://x.com/_fqnn_/status/1955577969189306785",
		avatar: "/fynn.jpg",
	},
	{
		name: "Axel Wesselgren",
		profession: "Founder, Stackster",
		quote: "Who just switched to the best data analytics platform? Me.",
		link: "https://x.com/axelwesselgren/status/1936670098884079755",
		avatar: "/axel.jpg",
	},
	{
		name: "Max",
		profession: "Founder, Pantom Studio",
		quote: "won't lie @trydatabuddy is very easy to setup damn",
		link: "https://x.com/Metagravity0/status/1945592294612017208",
		avatar: "/max.jpg",
	},
	{
		name: "Ahmet Kilinc",
		profession: "Software Engineer",
		quote:
			"if you're not using @trydatabuddy then your analytics are going down the drain.",
		link: "https://x.com/bruvimtired/status/1938972393357062401",
		avatar: "/ahmet.jpg",
	},
	{
		name: "Maze",
		profession: "Founder, OpenCut",
		quote: "@trydatabuddy is the only analytics i love.",
		link: "https://x.com/mazeincoding/status/1943019005339455631",
		avatar: "/maze.jpg",
	},
	{
		name: "Yassr Atti",
		profession: "Founder, Call",
		quote: "everything you need for analytics is at @trydatabuddy 🔥",
		link: "https://x.com/Yassr_Atti/status/1944455392018461107",
		avatar: "/yassr.jpg",
	},
];

function Attribution({ person }: { person: Person }) {
	return (
		<div className="flex items-center gap-3">
			<Image
				alt=""
				className="size-9 shrink-0 rounded-sm ring-1 ring-white/10"
				height={36}
				src={person.avatar}
				width={36}
			/>
			<div className="min-w-0">
				<p className="truncate text-sm">
					<span className="font-medium text-foreground">{person.name}</span>{" "}
					<span className="text-muted-foreground">
						@{new URL(person.link).pathname.split("/")[1]}
					</span>
				</p>
				<p className="truncate font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
					{person.profession}
				</p>
			</div>
		</div>
	);
}

function QuoteLink({
	children,
	className,
	person,
}: {
	children: ReactNode;
	className?: string;
	person: Person;
}) {
	return (
		<a
			className={cn(
				"group relative block bg-background transition-colors duration-300 ease-in-out hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				className
			)}
			href={person.link}
			rel="noopener noreferrer"
			target="_blank"
		>
			<SiX
				aria-hidden
				className="absolute top-6 right-6 size-3.5 text-muted-foreground/40 transition-colors duration-300 ease-in-out group-hover:text-foreground sm:top-8 sm:right-8"
			/>
			{children}
		</a>
	);
}

export default function Testimonials() {
	return (
		<div className="relative max-w-full">
			<div className="mb-10 flex items-start gap-2 text-start sm:mb-12 lg:mb-16">
				<span className="mt-1.5 hidden sm:block">
					<SectionBullet color="#714075" />
				</span>
				<div>
					<h2 className="mb-2 font-semibold text-2xl leading-tight tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
						Why developers are switching
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-xl">
						Hear from developers using Databuddy alongside or instead of GA4,
						PostHog, and Plausible.
					</p>
				</div>
			</div>

			<div className="grid gap-px border border-white/[0.06] bg-white/[0.06] md:grid-cols-2 lg:grid-cols-3">
				<QuoteLink
					className="md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1"
					person={featured}
				>
					<SciFiCard
						className="flex h-full flex-col justify-between gap-12 p-6 sm:p-8"
						cornerOpacity="opacity-60"
						style={{
							backgroundImage:
								"linear-gradient(to right, rgb(255 255 255 / 0.025) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.025) 1px, transparent 1px)",
							backgroundSize: "24px 24px",
						}}
					>
						<blockquote className="text-pretty pr-6 text-muted-foreground text-xl leading-snug tracking-tight sm:text-2xl">
							“
							{featured.quote.map((part) => (
								<span
									className={part.highlight ? "text-foreground" : undefined}
									key={part.text}
								>
									{part.text}
								</span>
							))}
							”
						</blockquote>
						<Attribution person={featured} />
					</SciFiCard>
				</QuoteLink>

				{testimonials.map((testimonial, index) => (
					<QuoteLink
						className={cn(
							index === testimonials.length - 1 && "md:col-span-2 lg:col-span-1"
						)}
						key={testimonial.name}
						person={testimonial}
					>
						<div className="flex h-full flex-col justify-between gap-8 p-6 sm:p-8">
							<blockquote className="text-pretty pr-6 text-[15px] text-foreground/80 leading-relaxed">
								“{testimonial.quote}”
							</blockquote>
							<Attribution person={testimonial} />
						</div>
					</QuoteLink>
				))}
			</div>
		</div>
	);
}
