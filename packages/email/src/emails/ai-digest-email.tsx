import {
	Body,
	Button,
	Column,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	pixelBasedPreset,
	Preview,
	Row,
	Section,
	Tailwind,
	type TailwindConfig,
	Text,
} from "@react-email/components";

export interface AiDigestProduct {
	logoUrl?: string;
	name: string;
	reads: number;
	role: string;
	visitors: number;
}

export interface AiDigestLandingPage {
	logoUrl?: string;
	page: string;
	visitors: number;
}

export interface AiDigestPage {
	format: "html" | "llms" | "markdown";
	page: string;
	reads: number;
}

export interface AiDigestEmailProps {
	agentsUrl: string;
	landingPages: AiDigestLandingPage[];
	newPages: number;
	pages: AiDigestPage[];
	period: string;
	previousVisitors: number;
	products: AiDigestProduct[];
	reads: number;
	settingsUrl: string;
	site: string;
	visitors: number;
}

const LOGO_URL = "https://www.databuddy.cc/brand/primary-logo/black.png";
const FORMAT_TAGS: Partial<Record<AiDigestPage["format"], string>> = {
	llms: "llms.txt",
	markdown: "MD",
};

const tailwindConfig = {
	presets: [pixelBasedPreset],
	theme: {
		extend: {
			colors: {
				canvas: "#F4F4F5",
				faint: "#A1A1AA",
				ink: "#18181B",
				line: "#E4E4E7",
				paper: "#FFFFFF",
				sub: "#52525B",
				up: "#15803D",
			},
		},
	},
} satisfies TailwindConfig;

const FONT =
	"font-['-apple-system',BlinkMacSystemFont,'Segoe_UI',Helvetica,Arial,sans-serif]";

const n = (value: number) => value.toLocaleString("en-US");

function shortPath(path: string): string {
	return path.length > 40 ? `${path.slice(0, 22)}…${path.slice(-15)}` : path;
}

function visitorChange(visitors: number, previous: number): string {
	if (visitors === previous) {
		return "Same as last week";
	}
	const difference = Math.abs(visitors - previous);
	return visitors > previous
		? `+${n(difference)} from last week`
		: `${n(difference)} fewer than last week`;
}

function Logo({
	name,
	size,
	url,
}: {
	name: string;
	size: number;
	url?: string;
}) {
	return url ? (
		<Img alt={name} height={size} src={url} width={size} />
	) : (
		<Text
			className="m-0 rounded-[7px] bg-canvas text-center font-medium text-[12px] text-sub"
			style={{ height: size, lineHeight: `${size}px`, width: size }}
		>
			{name.charAt(0).toUpperCase()}
		</Text>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<Column className="w-1/2 align-top">
			<Text className="m-0 font-semibold text-[22px] text-ink">{n(value)}</Text>
			<Text className="m-0 mt-1 text-[13px] text-sub">{label}</Text>
		</Column>
	);
}

function ListTitle({ hint, title }: { hint: string; title: string }) {
	return (
		<Row className="mb-1">
			<Column>
				<Heading as="h2" className="m-0 font-medium text-[13px] text-ink">
					{title}
				</Heading>
			</Column>
			<Column align="right" className="text-[12px] text-faint">
				{hint}
			</Column>
		</Row>
	);
}

export const AiDigestEmail = ({
	agentsUrl,
	landingPages,
	newPages,
	pages,
	period,
	previousVisitors,
	products,
	reads,
	settingsUrl,
	site,
	visitors,
}: AiDigestEmailProps) => {
	const senders = products.filter((product) => product.visitors > 0);
	const hasVisitors = visitors > 0;

	return (
		<Html lang="en">
			<Tailwind config={tailwindConfig}>
				<Head>
					<meta content="light" name="color-scheme" />
					<meta content="light" name="supported-color-schemes" />
				</Head>
				<Preview>
					{hasVisitors
						? `${senders[0]?.name ?? "AI"} sent you ${n(visitors)} ${visitors === 1 ? "visitor" : "visitors"}. AI read your site ${n(reads)} times.`
						: `AI read ${site} ${n(reads)} times this week.`}
				</Preview>
				<Body className={`m-0 bg-canvas py-10 ${FONT}`}>
					<Container className="mx-auto max-w-[560px] px-4">
						<Section className="rounded-xl border border-line border-solid bg-paper px-8 py-8">
							<Row>
								<Column>
									<Img alt="Databuddy" height={22} src={LOGO_URL} width={94} />
								</Column>
								<Column align="right" className="text-[13px] text-sub">
									{period}
								</Column>
							</Row>

							<Text className="m-0 mt-10 text-[14px] text-sub">
								{hasVisitors
									? `Visitors from AI on ${site}`
									: `Times AI read ${site}`}
							</Text>
							<Text className="m-0 mt-1 font-semibold text-[48px] text-ink leading-[52px] tracking-tight">
								{n(hasVisitors ? visitors : reads)}
							</Text>
							{hasVisitors ? (
								<Text className="m-0 mt-2 text-[14px] text-sub">
									<span
										className={
											visitors > previousVisitors ? "font-medium text-up" : ""
										}
									>
										{visitorChange(visitors, previousVisitors)}
									</span>
									{senders.length === 1 ? `, all from ${senders[0]?.name}` : ""}
								</Text>
							) : null}

							<Hr className="my-8 border-line" />
							<Row>
								{hasVisitors ? (
									<Stat label="Times AI read your site" value={reads} />
								) : (
									<Stat
										label="AI products reading it"
										value={products.length}
									/>
								)}
								<Stat
									label="Pages AI hadn't read in 90 days"
									value={newPages}
								/>
							</Row>
							<Hr className="my-8 border-line" />

							<Row>
								<Column className="pb-2 text-[12px] text-faint">
									AI product
								</Column>
								<Column
									align="right"
									className="w-[64px] pb-2 text-[12px] text-faint"
								>
									Reads
								</Column>
								<Column
									align="right"
									className="w-[64px] pb-2 text-[12px] text-faint"
								>
									Visitors
								</Column>
							</Row>
							{products.map((product) => (
								<Row
									className="border-0 border-line border-t border-solid"
									key={product.name}
								>
									<Column className="py-[10px]">
										<Row>
											<Column className="w-[40px]">
												<Logo
													name={product.name}
													size={28}
													url={product.logoUrl}
												/>
											</Column>
											<Column>
												<Text className="m-0 text-[14px] text-ink leading-[18px]">
													{product.name}
												</Text>
												<Text className="m-0 text-[12px] text-faint leading-[16px]">
													{product.role}
												</Text>
											</Column>
										</Row>
									</Column>
									<Column
										align="right"
										className="py-[10px] text-[14px] text-ink"
									>
										{n(product.reads)}
									</Column>
									<Column
										align="right"
										className={`py-[10px] text-[14px] ${product.visitors ? "font-medium text-ink" : "text-faint"}`}
									>
										{n(product.visitors)}
									</Column>
								</Row>
							))}

							{landingPages.length > 0 ? (
								<Section className="mt-9">
									<ListTitle hint="visitors" title="Where AI visitors landed" />
									{landingPages.map((row) => (
										<Row
											className="border-0 border-line border-t border-solid"
											key={row.page}
										>
											<Column className="py-[9px] font-mono text-[13px] text-ink">
												{shortPath(row.page)}
											</Column>
											<Column align="right" className="w-[36px] py-[9px]">
												{row.logoUrl ? (
													<Img
														alt=""
														height={20}
														src={row.logoUrl}
														width={20}
													/>
												) : null}
											</Column>
											<Column
												align="right"
												className="w-[40px] py-[9px] text-[14px] text-ink"
											>
												{n(row.visitors)}
											</Column>
										</Row>
									))}
								</Section>
							) : null}

							{pages.length > 0 ? (
								<Section className="mt-9">
									<ListTitle hint="reads" title="Most read by AI" />
									{pages.map((row) => (
										<Row
											className="border-0 border-line border-t border-solid"
											key={`${row.page}-${row.format}`}
										>
											<Column className="py-[9px] font-mono text-[13px] text-ink">
												{shortPath(row.page)}
												{FORMAT_TAGS[row.format] ? (
													<span className="ml-2 rounded bg-canvas px-[6px] py-[1px] font-sans text-[11px] text-sub">
														{FORMAT_TAGS[row.format]}
													</span>
												) : null}
											</Column>
											<Column
												align="right"
												className="w-[60px] py-[9px] text-[14px] text-ink"
											>
												{n(row.reads)}
											</Column>
										</Row>
									))}
								</Section>
							) : null}

							<Section className="mt-9">
								<Button
									className="rounded-md bg-ink px-5 py-[11px] font-medium text-[14px] text-paper"
									href={agentsUrl}
								>
									Open AI agents
								</Button>
							</Section>
						</Section>

						<Text className="m-0 mt-6 text-center text-[12px] text-faint leading-[18px]">
							You get this every Monday for {site}. Times in UTC.
							<br />
							<Link className="text-faint underline" href={settingsUrl}>
								Email settings
							</Link>
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

AiDigestEmail.PreviewProps = {
	agentsUrl: "https://app.databuddy.cc/websites/example/agents",
	landingPages: [
		{
			logoUrl: "https://app.databuddy.cc/ai/email/ChatGPT.png",
			page: "/careers",
			visitors: 5,
		},
		{
			logoUrl: "https://app.databuddy.cc/ai/email/ChatGPT.png",
			page: "/blog/plausible-vs-matomo-vs-privacy-first-analytics-2026",
			visitors: 2,
		},
	],
	newPages: 10,
	pages: [
		{ format: "html", page: "/", reads: 126 },
		{ format: "html", page: "/pricing", reads: 89 },
		{ format: "markdown", page: "/docs/sdk/ai-agents", reads: 10 },
	],
	period: "Sep 21 to 27",
	previousVisitors: 3,
	products: [
		{
			logoUrl: "https://app.databuddy.cc/ai/email/ChatGPT.png",
			name: "ChatGPT",
			reads: 444,
			role: "Search crawler",
			visitors: 13,
		},
		{
			logoUrl: "https://app.databuddy.cc/ai/email/Meta.png",
			name: "Meta AI",
			reads: 1030,
			role: "Trains AI models",
			visitors: 0,
		},
		{
			logoUrl: "https://app.databuddy.cc/ai/email/Claude.png",
			name: "Claude",
			reads: 88,
			role: "Trains AI models",
			visitors: 0,
		},
	],
	reads: 1830,
	settingsUrl: "https://app.databuddy.cc/settings/notifications",
	site: "www.example.com",
	visitors: 13,
} satisfies AiDigestEmailProps;

export default AiDigestEmail;
