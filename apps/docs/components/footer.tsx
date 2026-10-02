"use client";

import { EnvelopeIcon } from "@databuddy/ui/icons";
import { SiDiscord, SiGithub, SiX } from "@icons-pack/react-simple-icons";
import {
	animate,
	motion,
	useInView,
	useMotionTemplate,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { IN_OUT, StatusLine } from "./landing/demo-primitives";
import { SciFiButton } from "./landing/scifi-btn";
import { LogoContent } from "./logo";
import { NavLink } from "./nav-link";
import { NewsletterForm } from "./newsletter-form";

const footerSections = [
	{
		title: "Product",
		items: [
			{ href: "/docs", label: "Docs", navItem: "docs" },
			{ href: "/developers", label: "Developers", navItem: "developers" },
			{ href: "/pricing", label: "Pricing", navItem: "pricing" },
			{ href: "/startups", label: "Startups", navItem: "startups" },
			{
				href: "/calculator",
				label: "Measurement gap calculator",
				navItem: "calculator",
			},
			{ href: "/compare", label: "Compare", navItem: "compare" },
			{ href: "/changelog", label: "Changelog", navItem: "changelog" },
		],
	},
	{
		title: "Company",
		items: [
			{ href: "/blog", label: "Blog", navItem: "blog" },
			{ href: "/about", label: "About", navItem: "about" },
			{ href: "/manifesto", label: "Manifesto", navItem: "manifesto" },
			{ href: "/careers", label: "Careers", navItem: "careers" },
			{ href: "/contact", label: "Contact", navItem: "contact" },
		],
	},
] as const;

const socialLinks = [
	{
		href: "https://github.com/databuddy-analytics/Databuddy",
		icon: SiGithub,
		label: "GitHub",
		navItem: "github",
	},
	{
		href: "https://discord.gg/JTk7a38tCZ",
		icon: SiDiscord,
		label: "Discord",
		navItem: "discord",
	},
	{
		href: "https://x.com/trydatabuddy",
		icon: SiX,
		label: "X",
		navItem: "twitter",
	},
] as const;

const legalLinks = [
	{ href: "/privacy", label: "Privacy Policy" },
	{ href: "/data-policy", label: "Data Policy" },
	{ href: "/dpa", label: "DPA" },
	{ href: "/terms", label: "Terms of Service" },
] as const;

const TRAFFIC = [
	34, 42, 51, 46, 58, 67, 61, 73, 69, 81, 76, 63, 70, 86, 97, 88, 78, 93, 121,
	104, 85, 77, 83, 72, 66, 78, 91, 101, 94, 84, 71, 65, 57, 62, 72, 66, 54, 47,
	40, 45,
];
const RIDGE_WIDTH = 1440;
const RIDGE_HEIGHT = 220;
const RIDGE_POINTS = 26;
const RIDGE_STEP = RIDGE_WIDTH / (RIDGE_POINTS - 1);
const LIVE_POSITION = 0.64;
const LIVE_LEFT = `${LIVE_POSITION * 100}%`;
const EDGE_FADE =
	"linear-gradient(to right, transparent, black 8%, black 92%, transparent)";

const SUNSET_BANDS = [
	{ color: "#483C7B", width: 110, y: 270 },
	{ color: "#714075", width: 90, y: 300 },
	{ color: "#B24A7E", width: 72, y: 326 },
	{ color: "#CD5F20", width: 58, y: 347 },
	{ color: "#E3A514", width: 46, y: 364 },
];

const STARS = [
	{ x: 54, y: 14, delay: 0 },
	{ x: 61, y: 31, delay: 1.8 },
	{ x: 68, y: 9, delay: 3.1 },
	{ x: 74, y: 24, delay: 0.9 },
	{ x: 79, y: 41, delay: 2.4 },
	{ x: 84, y: 12, delay: 4.2 },
	{ x: 89, y: 29, delay: 1.2 },
	{ x: 93, y: 18, delay: 3.6 },
	{ x: 97, y: 37, delay: 2.1 },
	{ x: 46, y: 6, delay: 4.8 },
	{ x: 6, y: 9, delay: 2.7 },
	{ x: 15, y: 4, delay: 0.5 },
];

function round(value: number) {
	return Math.round(value * 10) / 10;
}

function ridgePoints(tick: number, progress: number) {
	return Array.from({ length: RIDGE_POINTS + 3 }, (_, index) => {
		const value = TRAFFIC[(tick + index) % TRAFFIC.length];
		return {
			x: (index - 1 - progress) * RIDGE_STEP,
			y: RIDGE_HEIGHT - 20 - value * 1.45,
		};
	});
}

function ridgeLine(tick: number, progress: number) {
	const points = ridgePoints(tick, progress);
	let path = `M${round(points[1].x)} ${round(points[1].y)}`;
	for (let index = 1; index < points.length - 2; index++) {
		const [before, from, to, after] = points.slice(index - 1, index + 3);
		path += ` C${round(from.x + RIDGE_STEP / 3)} ${round(from.y + (to.y - before.y) / 6)} ${round(to.x - RIDGE_STEP / 3)} ${round(to.y - (after.y - from.y) / 6)} ${round(to.x)} ${round(to.y)}`;
	}
	return path;
}

function ridgeArea(tick: number, progress: number) {
	const line = ridgeLine(tick, progress);
	return `${line} L${RIDGE_WIDTH + RIDGE_STEP * 2} ${RIDGE_HEIGHT} L${-RIDGE_STEP} ${RIDGE_HEIGHT} Z`;
}

function ridgeY(points: { x: number; y: number }[], x: number) {
	const index = Math.max(
		1,
		Math.min(points.length - 3, Math.floor((x - points[1].x) / RIDGE_STEP) + 1)
	);
	const [before, from, to, after] = points.slice(index - 1, index + 3);
	const t = (x - from.x) / RIDGE_STEP;
	const lift = (to.y - before.y) / 6;
	const drop = (after.y - from.y) / 6;
	return (
		(1 - t) ** 3 * from.y +
		3 * (1 - t) ** 2 * t * (from.y + lift) +
		3 * (1 - t) * t ** 2 * (to.y - drop) +
		t ** 3 * to.y
	);
}

function liveHeight(tick: number, progress: number) {
	const y = ridgeY(ridgePoints(tick, progress), LIVE_POSITION * RIDGE_WIDTH);
	return `${round((y / RIDGE_HEIGHT) * 100)}%`;
}

function Sunset({ live }: { live: boolean }) {
	return (
		<motion.svg
			animate={live ? { opacity: [0.75, 1, 0.75] } : { opacity: 0.9 }}
			className="absolute inset-x-0 bottom-0 h-[calc(100%+12rem)] w-full"
			fill="none"
			preserveAspectRatio="none"
			style={{
				maskComposite: "intersect",
				maskImage: `radial-gradient(ellipse 70% 75% at 62% 92%, black 40%, transparent 85%), ${EDGE_FADE}`,
			}}
			transition={
				live
					? { duration: 9, ease: "easeInOut", repeat: Number.POSITIVE_INFINITY }
					: undefined
			}
			viewBox="0 0 1440 500"
		>
			<defs>
				<filter
					filterUnits="userSpaceOnUse"
					height="900"
					id="footer-sunset-blur"
					width="2240"
					x="-400"
					y="-200"
				>
					<feGaussianBlur stdDeviation="30" />
				</filter>
			</defs>
			<g filter="url(#footer-sunset-blur)">
				{SUNSET_BANDS.map((band) => (
					<path
						d={`M-240 ${band.y + 40} C320 ${band.y - 30} 980 ${band.y - 40} 1680 ${band.y + 30}`}
						key={band.color}
						stroke={band.color}
						strokeWidth={band.width}
					/>
				))}
				<ellipse
					cx="930"
					cy="388"
					fill="#FFC861"
					opacity="0.6"
					rx="130"
					ry="26"
				/>
			</g>
		</motion.svg>
	);
}

function Ridge({ live }: { live: boolean }) {
	const tick = useMotionValue(0);
	const progress = useMotionValue(0);
	const line = useTransform([tick, progress], ([t, p]: number[]) =>
		ridgeLine(t, p)
	);
	const area = useTransform([tick, progress], ([t, p]: number[]) =>
		ridgeArea(t, p)
	);
	const liveTop = useTransform([tick, progress], ([t, p]: number[]) =>
		liveHeight(t, p)
	);
	const reach = useMotionTemplate`calc(${liveTop} + 0.75rem)`;

	useEffect(() => {
		if (!live) {
			return;
		}
		let timer: ReturnType<typeof setTimeout>;
		let controls: ReturnType<typeof animate> | undefined;
		const step = () => {
			controls = animate(progress, 1, {
				duration: 1.6,
				ease: "easeInOut",
				onComplete: () => {
					tick.set(tick.get() + 1);
					progress.set(0);
					timer = setTimeout(step, 900);
				},
			});
		};
		timer = setTimeout(step, 600);
		return () => {
			clearTimeout(timer);
			controls?.stop();
		};
	}, [live, progress, tick]);

	return (
		<>
			<svg
				aria-hidden="true"
				className="absolute inset-0 h-full w-full"
				fill="none"
				preserveAspectRatio="none"
				viewBox={`0 0 ${RIDGE_WIDTH} ${RIDGE_HEIGHT}`}
			>
				<defs>
					<linearGradient
						gradientUnits="userSpaceOnUse"
						id="footer-ridge-rim"
						x1="0"
						x2={RIDGE_WIDTH}
						y1="0"
						y2="0"
					>
						<stop offset="0" stopColor="#e7e8eb" stopOpacity="0.08" />
						<stop offset="0.3" stopColor="#B24A7E" stopOpacity="0.6" />
						<stop offset="0.5" stopColor="#CD5F20" stopOpacity="0.85" />
						<stop offset="0.64" stopColor="#F7D79A" />
						<stop offset="0.78" stopColor="#E3A514" stopOpacity="0.7" />
						<stop offset="0.92" stopColor="#e7e8eb" stopOpacity="0.2" />
						<stop offset="1" stopColor="#e7e8eb" stopOpacity="0.08" />
					</linearGradient>
					<filter id="footer-ridge-glow">
						<feGaussianBlur stdDeviation="5" />
					</filter>
				</defs>
				<motion.path d={area} fill="var(--background)" />
				<motion.path
					d={line}
					filter="url(#footer-ridge-glow)"
					opacity={0.7}
					stroke="url(#footer-ridge-rim)"
					strokeWidth={6}
					vectorEffect="non-scaling-stroke"
				/>
				<motion.path
					d={line}
					stroke="url(#footer-ridge-rim)"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<motion.span
				aria-hidden
				className="absolute -top-3 w-px -translate-x-1/2 bg-linear-to-b from-foreground/10 to-[#F7D79A]"
				style={{ height: reach, left: LIVE_LEFT }}
			/>
			<motion.span
				aria-hidden
				className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FFF4DC] shadow-[0_0_14px_4px_rgba(247,215,154,0.55)]"
				style={{ left: LIVE_LEFT, top: liveTop }}
			>
				<motion.span
					animate={
						live ? { opacity: [0.7, 0], scale: [1, 3.2] } : { opacity: 0 }
					}
					className="absolute inset-0 rounded-full border border-[#F7D79A]"
					transition={
						live
							? {
									duration: 2.5,
									ease: IN_OUT,
									repeat: Number.POSITIVE_INFINITY,
								}
							: undefined
					}
				/>
			</motion.span>
			<DatabunnyNote />
		</>
	);
}

function DatabunnyNote() {
	return (
		<NavLink
			className="absolute bottom-[calc(100%+0.75rem)] w-64 -translate-x-[85%] rounded border border-border/60 bg-background/70 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur transition-colors duration-200 ease-in-out hover:border-border sm:w-80 sm:-translate-x-1/2"
			href="/databunny"
			navItem="databunny"
			section="footer"
			style={{ left: LIVE_LEFT }}
		>
			<span className="flex items-center justify-between gap-3">
				<span className="flex items-center gap-2">
					<Image
						alt=""
						height={16}
						src="/brand/bunny/white.svg"
						unoptimized
						width={16}
					/>
					<span className="font-semibold text-foreground text-sm">
						Databunny
					</span>
				</span>
				<StatusLine tone="emerald">Watching</StatusLine>
			</span>
			<span className="mt-2 block text-pretty text-muted-foreground text-xs leading-relaxed sm:text-sm">
				Traffic looks normal. I'll message you in Slack if anything moves.
			</span>
		</NavLink>
	);
}

function Stars({ live }: { live: boolean }) {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0">
			{STARS.map((star) => (
				<motion.span
					animate={live ? { opacity: [0.15, 0.7, 0.15] } : { opacity: 0.35 }}
					className="absolute size-0.5 bg-foreground sm:size-[3px]"
					key={`${star.x}-${star.y}`}
					style={{ left: `${star.x}%`, top: `${star.y}%` }}
					transition={
						live
							? {
									delay: star.delay,
									duration: 5,
									ease: "easeInOut",
									repeat: Number.POSITIVE_INFINITY,
								}
							: undefined
					}
				/>
			))}
		</div>
	);
}

function FooterScene() {
	const ref = useRef<HTMLDivElement>(null);
	const visible = useInView(ref, { amount: 0.2 });
	const reduce = useReducedMotion();
	const live = visible && !reduce;

	return (
		<div className="relative overflow-hidden" ref={ref}>
			<Stars live={live} />
			<div className="relative z-20 mx-auto w-full max-w-400 px-4 pt-24 sm:px-14 lg:px-20 lg:pt-32">
				<h2 className="font-semibold text-3xl sm:text-5xl md:text-6xl">
					See how people
					<br />
					<span className="text-muted-foreground">use your product.</span>
				</h2>
				<p className="mt-4 max-w-xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
					Start free with 10,000 events per month. No credit card required.
				</p>
				<div className="mt-6 flex flex-wrap items-center gap-3">
					<SciFiButton asChild className="px-6 py-5">
						<a
							data-destination="register"
							data-placement="footer_hero"
							data-track="cta_clicked"
							href="https://app.databuddy.cc/register"
						>
							Start free
						</a>
					</SciFiButton>
					<SciFiButton asChild className="px-6 py-5">
						<Link
							data-destination="demo"
							data-placement="footer_hero"
							data-track="cta_clicked"
							href="/demo"
						>
							Try the live demo
						</Link>
					</SciFiButton>
				</div>
			</div>
			<div className="relative mt-32 h-36 w-[160%] -translate-x-[18.75%] sm:h-48 sm:w-full sm:translate-x-0 lg:mt-6 lg:h-56">
				<Sunset live={live} />
				<Ridge live={live} />
			</div>
		</div>
	);
}

function FooterHeading({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="font-mono text-foreground text-xs uppercase tracking-widest">
			{children}
			<span className="mt-3 block h-px w-6 bg-foreground/40" />
		</h3>
	);
}

function FooterIntro() {
	return (
		<div className="col-span-2 flex flex-col gap-5 lg:col-span-1">
			<LogoContent />
			<p className="max-w-xs text-pretty text-muted-foreground text-sm sm:text-base">
				Privacy-first web analytics without compromising user data.
			</p>
			<NavLink
				className="flex w-fit items-center gap-3 text-muted-foreground text-sm hover:text-foreground sm:text-base"
				href="mailto:support@databuddy.cc"
				navItem="email"
				section="footer"
			>
				<EnvelopeIcon className="size-5" />
				support@databuddy.cc
			</NavLink>
			<div className="flex items-center gap-5 pt-1">
				{socialLinks.map(({ href, icon: Icon, label, navItem }) => (
					<NavLink
						className="text-muted-foreground hover:text-foreground"
						external
						href={href}
						key={navItem}
						navItem={navItem}
						section="footer"
					>
						<Icon className="size-5" />
						<span className="sr-only">{label}</span>
					</NavLink>
				))}
			</div>
		</div>
	);
}

function FooterSection({
	section,
}: {
	section: (typeof footerSections)[number];
}) {
	return (
		<div className="space-y-5">
			<FooterHeading>{section.title}</FooterHeading>
			<ul className="space-y-2.5 text-sm sm:text-base">
				{section.items.map((item) => (
					<li key={item.href}>
						<NavLink
							className="text-muted-foreground hover:text-foreground"
							href={item.href}
							navItem={item.navItem}
							section="footer"
						>
							{item.label}
						</NavLink>
					</li>
				))}
			</ul>
		</div>
	);
}

function FooterNewsletter() {
	return (
		<div className="col-span-2 space-y-5 lg:col-span-1">
			<FooterHeading>Newsletter</FooterHeading>
			<p className="max-w-xs text-pretty text-muted-foreground text-sm sm:text-base">
				New features and product updates, straight to your inbox.
			</p>
			<NewsletterForm source="footer" />
		</div>
	);
}

function FooterNav() {
	return (
		<div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
			<FooterIntro />
			{footerSections.map((section) => (
				<FooterSection key={section.title} section={section} />
			))}
			<FooterNewsletter />
		</div>
	);
}

function FooterBottom() {
	return (
		<div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
			<p className="text-muted-foreground/70 text-xs sm:text-sm">
				© {new Date().getFullYear()} Databuddy Analytics, Inc.
			</p>
			<div className="flex flex-wrap items-center gap-4">
				{legalLinks.map((link, index) => (
					<LegalLink index={index} key={link.href} link={link} />
				))}
			</div>
		</div>
	);
}

function LegalLink({
	index,
	link,
}: {
	index: number;
	link: (typeof legalLinks)[number];
}) {
	return (
		<>
			{index > 0 && <span className="text-muted-foreground/50 text-xs">•</span>}
			<Link
				className="text-muted-foreground/70 text-xs hover:text-muted-foreground sm:text-sm"
				href={link.href}
			>
				{link.label}
			</Link>
		</>
	);
}

export function Footer() {
	return (
		<footer className="bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
			<FooterScene />
			<div className="mx-auto flex w-full max-w-400 flex-col gap-14 px-4 pb-10 sm:px-14 lg:px-20">
				<FooterNav />
				<FooterBottom />
			</div>
		</footer>
	);
}
