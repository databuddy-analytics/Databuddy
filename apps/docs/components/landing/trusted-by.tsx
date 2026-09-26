import Image from "next/image";
import {
	Marquee,
	MarqueeContent,
	MarqueeFade,
	MarqueeItem,
} from "@/components/ui/kibo-ui/marquee";

const companies = [
	{
		name: "Quiver",
		url: "https://quiver.ai",
		logo: "/social/quiver.svg",
		invert: true,
	},
	{
		name: "Inth",
		badge: "YC P26",
		url: "https://inth.com",
		logo: "/social/inth.svg",
	},
	{
		name: "Tday",
		badge: "YC P26",
		url: "https://tday.com",
		logo: "/social/tday.png",
	},
	{
		name: "Rare UI",
		url: "https://www.rareui.com",
		logo: "/social/rare-ui.svg",
	},
	{
		name: "nuqs",
		url: "https://nuqs.dev",
		logo: "/social/nuqs.svg",
	},
	{
		name: "Coinstash",
		url: "https://coinstash.com.au",
		logo: "/social/coinstash.svg",
		invert: true,
	},
	{
		name: "Maza",
		url: "https://maza.vc",
		logo: "/social/maza.svg",
	},
	{
		name: "Figurable",
		url: "https://figurable.ai",
		logo: "/social/figurable.svg",
		invert: true,
	},
	{
		name: "Context.dev",
		badge: "YC S26",
		url: "https://www.context.dev",
		logo: "/social/context-dev.svg",
	},
	{
		name: "Cortad",
		url: "https://cortad.com",
		logo: "/social/cortad.png",
	},
];

const half = Math.ceil(companies.length / 2);
const companyRows = [companies.slice(0, half), companies.slice(half)];

const devTeams = [
	{
		name: "CodeRabbit",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/coderabbit.svg",
	},
	{
		name: "OpenAI",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/openai.svg",
	},
	{
		name: "Vercel",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/vercel.svg",
	},
	{
		name: "Supabase",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/supabase.svg",
	},
	{
		name: "Upstash",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/upstash.svg",
	},
];

function CompanyCard({ company }: { company: (typeof companies)[number] }) {
	return (
		<a
			className="group flex w-44 flex-col items-center justify-center gap-3 rounded-lg border border-border/50 bg-card/50 px-4 py-5 transition-colors duration-300 hover:border-border hover:bg-card sm:w-52 sm:py-6"
			href={company.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<Image
				alt={company.name}
				className={`h-6 max-w-full object-contain opacity-70 transition-opacity duration-200 group-hover:opacity-100 sm:h-7 ${company.invert ? "invert" : ""}`}
				height={28}
				src={company.logo}
				style={{ width: "auto" }}
				width={120}
			/>
			<div className="flex items-center gap-1.5">
				<span className="text-muted-foreground text-xs transition-colors group-hover:text-foreground">
					{company.name}
				</span>
				{company.badge && (
					<span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] text-primary leading-none">
						{company.badge}
					</span>
				)}
			</div>
		</a>
	);
}

export function TrustedBy() {
	return (
		<div className="w-full py-10 sm:py-12">
			<p className="mb-6 text-pretty text-center text-muted-foreground text-sm uppercase tracking-wide">
				Used by developers at
			</p>

			<div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 sm:gap-x-12">
				{devTeams.map((team) => (
					<div
						className="flex items-center gap-2.5 text-foreground"
						key={team.name}
					>
						<img
							alt={team.name}
							className="size-5 rounded-sm invert sm:size-6"
							height={24}
							src={team.icon}
							width={24}
						/>
						<span className="font-medium text-sm sm:text-base">
							{team.name}
						</span>
					</div>
				))}
			</div>

			<div className="mx-auto my-8 h-px w-full max-w-xs bg-border/50 sm:my-10" />

			<p className="mb-5 text-center text-muted-foreground/60 text-xs uppercase tracking-wide">
				And teams including
			</p>

			<div className="flex flex-col gap-3 sm:gap-4">
				{companyRows.map((row, index) => (
					<Marquee key={row[0].name}>
						<MarqueeFade side="left" />
						<MarqueeFade side="right" />
						<MarqueeContent
							direction={index % 2 === 0 ? "left" : "right"}
							gradient={false}
							speed={30}
						>
							{row.map((company) => (
								<MarqueeItem key={company.name}>
									<CompanyCard company={company} />
								</MarqueeItem>
							))}
						</MarqueeContent>
					</Marquee>
				))}
			</div>
		</div>
	);
}
