import Image from "next/image";
import {
	Marquee,
	MarqueeContent,
	MarqueeFade,
	MarqueeItem,
} from "@/components/ui/kibo-ui/marquee";
import { cn } from "@/lib/utils";

const companies = [
	{
		name: "Quiver",
		url: "https://quiver.ai",
		logo: "/social/quiver.svg",
		invert: true,
	},
	{
		name: "Context.dev",
		ycBatch: "S26",
		url: "https://www.context.dev",
		logo: "/social/context-dev.svg",
	},
	{
		name: "Inth",
		ycBatch: "P26",
		url: "https://inth.com",
		logo: "/social/inth.svg",
	},
	{
		name: "Tday",
		ycBatch: "P26",
		url: "https://tday.com",
		logo: "/social/tday.png",
		markOnly: true,
	},
	{
		name: "Coinstash",
		url: "https://coinstash.com.au",
		logo: "/social/coinstash.svg",
		invert: true,
	},
	{
		name: "nuqs",
		url: "https://nuqs.dev",
		logo: "/social/nuqs.svg",
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
		name: "Cortad",
		url: "https://cortad.com",
		logo: "/social/cortad.png",
		markOnly: true,
	},
	{
		name: "Rare UI",
		url: "https://www.rareui.com",
		logo: "/social/rare-ui.svg",
		markOnly: true,
	},
	{
		name: "Notra",
		url: "https://www.usenotra.com",
		logo: "/notra.svg",
		markOnly: true,
	},
];

const half = Math.ceil(companies.length / 2);
const companyRows = [companies.slice(0, half), companies.slice(half)];

const devTeams = ["CodeRabbit", "OpenAI", "Vercel", "Supabase", "Upstash"];

function CompanyCard({ company }: { company: (typeof companies)[number] }) {
	return (
		<a
			className="group relative flex h-24 w-44 items-center justify-center rounded-lg border border-border/50 bg-card/50 px-4 transition-colors duration-300 hover:border-border hover:bg-card sm:h-26 sm:w-52"
			href={company.url}
			rel="noopener noreferrer"
			target="_blank"
		>
			<div className="flex h-7 max-w-full items-center gap-2.5 text-foreground opacity-70 transition-opacity duration-200 group-hover:opacity-100">
				<Image
					alt={company.markOnly ? "" : company.name}
					className={cn(
						"max-w-full object-contain",
						company.markOnly ? "h-5 rounded-sm sm:h-6" : "h-6 sm:h-7",
						company.invert && "invert"
					)}
					height={28}
					src={company.logo}
					style={{ width: "auto" }}
					width={120}
				/>
				{company.markOnly && (
					<span className="font-medium text-sm sm:text-base">
						{company.name}
					</span>
				)}
			</div>
			{company.ycBatch && (
				<span className="absolute top-2 right-2 flex items-center gap-1 rounded bg-primary/10 py-0.5 pr-1.5 pl-0.5 font-mono text-[9px] text-primary leading-none">
					<img
						alt="Y Combinator"
						className="size-3 rounded-[2px]"
						height={12}
						src="/social/ycombinator.svg"
						width={12}
					/>
					{company.ycBatch}
				</span>
			)}
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
					<div className="flex items-center gap-2.5 text-foreground" key={team}>
						<img
							alt={team}
							className="size-5 rounded-sm invert sm:size-6"
							height={24}
							src={`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${team.toLowerCase()}.svg`}
							width={24}
						/>
						<span className="font-medium text-sm sm:text-base">{team}</span>
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
