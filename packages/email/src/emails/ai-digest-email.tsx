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
import { render } from "@react-email/render";
import type { ContentFormat } from "@databuddy/shared/bot-detection/types";

export interface AiDigestEmailProps {
	agentsUrl: string;
	changes: {
		current: number;
		metric: "requests" | "visitors";
		previous: number;
		product: string;
	}[];
	hasServerTracking: boolean;
	landingPages: { logoUrl?: string; page: string; visitors: number }[];
	newPages: number | null;
	pages: { format: ContentFormat; page: string; reads: number }[];
	period: string;
	previousVisitors: number;
	products: {
		logoUrl?: string;
		name: string;
		reads: number;
		role: string;
		visitors: number;
	}[];
	reads: number;
	settingsUrl: string;
	site: string;
	visitors: number;
}

const LOGO_URL = "https://www.databuddy.cc/brand/primary-logo/black.png";
const FORMAT_TAGS: Partial<Record<ContentFormat, string>> = {
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

const DIVIDER = "border-0 border-line border-t border-solid";

const formatCount = (value: number) => value.toLocaleString("en-US");

function shortPath(path: string): string {
	return path.length > 40 ? `${path.slice(0, 22)}…${path.slice(-15)}` : path;
}

function visitorChange(visitors: number, previous: number): string {
	if (visitors === previous) {
		return "Same as last week";
	}
	const difference = Math.abs(visitors - previous);
	return visitors > previous
		? `+${formatCount(difference)} from last week`
		: `${formatCount(difference)} fewer than last week`;
}

const CHANGE_COPY = {
	requests: {
		down: "read your site less",
		started: "started reading your site",
		stopped: "stopped reading your site",
		up: "read your site more",
	},
	visitors: {
		down: "sent fewer visitors",
		started: "started sending visitors",
		stopped: "stopped sending visitors",
		up: "sent more visitors",
	},
};

function changeLabel({
	current,
	metric,
	previous,
	product,
}: AiDigestEmailProps["changes"][number]): string {
	const copy = CHANGE_COPY[metric];
	if (previous === 0) {
		return `${product} ${copy.started}`;
	}
	if (current === 0) {
		return `${product} ${copy.stopped}`;
	}
	return `${product} ${current > previous ? copy.up : copy.down}`;
}

function ProductLogo({ name, url }: { name: string; url?: string }) {
	return url ? (
		<Img alt={name} height={28} src={url} width={28} />
	) : (
		<Text
			className="m-0 rounded-[7px] bg-canvas text-center font-medium text-[12px] text-sub"
			style={{ height: 28, lineHeight: "28px", width: 28 }}
		>
			{name.charAt(0).toUpperCase()}
		</Text>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<Column className="w-1/2 align-top">
			<Text className="m-0 font-semibold text-[22px] text-ink">
				{formatCount(value)}
			</Text>
			<Text className="m-0 mt-1 text-[13px] text-sub">{label}</Text>
		</Column>
	);
}

function PathList({
	hint,
	rows,
	title,
}: {
	hint: string;
	rows: { logoUrl?: string; page: string; tag?: string; value: number }[];
	title: string;
}) {
	if (rows.length === 0) {
		return null;
	}
	const hasLogos = rows.some((row) => row.logoUrl);
	return (
		<Section className="mt-9">
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
			{rows.map((row) => (
				<Row className={DIVIDER} key={`${row.page}-${row.tag ?? ""}`}>
					<Column className="py-[9px] font-mono text-[13px] text-ink">
						{shortPath(row.page)}
						{row.tag ? (
							<>
								{" "}
								<span className="ml-1 rounded bg-canvas px-[6px] py-[1px] font-sans text-[11px] text-sub">
									{row.tag}
								</span>
							</>
						) : null}
					</Column>
					{hasLogos ? (
						<Column align="right" className="w-[36px] py-[9px]">
							{row.logoUrl ? (
								<Img alt="" height={20} src={row.logoUrl} width={20} />
							) : null}
						</Column>
					) : null}
					<Column
						align="right"
						className="w-[56px] py-[9px] text-[14px] text-ink"
					>
						{formatCount(row.value)}
					</Column>
				</Row>
			))}
		</Section>
	);
}

export const AiDigestEmail = ({
	agentsUrl,
	changes,
	hasServerTracking,
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
	const shouldHideReads = !hasServerTracking && reads === 0;
	const visitorSummary = `${formatCount(visitors)} ${visitors === 1 ? "visitor" : "visitors"} from AI`;
	const setupUrl = new URL(agentsUrl);
	setupUrl.searchParams.set("setup", "true");
	const setupCallout = hasServerTracking ? null : (
		<Section
			className={`rounded-lg bg-canvas px-5 py-4 ${shouldHideReads ? "" : "mt-9"}`}
		>
			<Text className="m-0 font-medium text-[14px] text-ink">
				{shouldHideReads
					? "See which AI crawlers read your site"
					: "See every AI crawler, not just some"}
			</Text>
			<Text className="m-0 mt-1 text-[13px] text-sub leading-[20px]">
				GPTBot, ClaudeBot, and most AI crawlers don't run JavaScript, so they're
				missing from {shouldHideReads ? "this email" : "these reads"}. One line
				on your server adds them.{" "}
				<Link
					className="font-medium text-ink underline"
					href={setupUrl.toString()}
				>
					Set it up
				</Link>
			</Text>
		</Section>
	);

	return (
		<Html lang="en">
			<Tailwind config={tailwindConfig}>
				<Head>
					<meta content="light" name="color-scheme" />
					<meta content="light" name="supported-color-schemes" />
				</Head>
				<Preview>
					{shouldHideReads
						? `${visitorSummary}.`
						: `${visitorSummary}, and AI read ${site} ${formatCount(reads)} ${reads === 1 ? "time" : "times"}.`}
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
								Visitors from AI on {site}
							</Text>
							<Text className="m-0 mt-1 font-semibold text-[48px] text-ink leading-[52px] tracking-tight">
								{formatCount(visitors)}
							</Text>
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

							<Hr className="my-8 border-line" />
							{shouldHideReads ? (
								setupCallout
							) : (
								<Row>
									<Stat label="Times AI read your site" value={reads} />
									{newPages === null ? null : (
										<Stat
											label="Pages AI hadn't read in 90 days"
											value={newPages}
										/>
									)}
								</Row>
							)}
							<Hr className="my-8 border-line" />

							<Row>
								<Column className="pb-2 text-[12px] text-faint">
									AI product
								</Column>
								{shouldHideReads ? null : (
									<Column
										align="right"
										className="w-[64px] pb-2 text-[12px] text-faint"
									>
										Reads
									</Column>
								)}
								<Column
									align="right"
									className="w-[64px] pb-2 text-[12px] text-faint"
								>
									Visitors
								</Column>
							</Row>
							{products.map((product) => (
								<Row className={DIVIDER} key={product.name}>
									<Column className="py-[10px]">
										<Row>
											<Column className="w-[40px]">
												<ProductLogo
													name={product.name}
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
									{shouldHideReads ? null : (
										<Column
											align="right"
											className="py-[10px] text-[14px] text-ink"
										>
											{formatCount(product.reads)}
										</Column>
									)}
									<Column
										align="right"
										className={`py-[10px] text-[14px] ${product.visitors ? "font-medium text-ink" : "text-faint"}`}
									>
										{formatCount(product.visitors)}
									</Column>
								</Row>
							))}

							{changes.length > 0 ? (
								<Section className="mt-9">
									<Row className="mb-1">
										<Column>
											<Heading
												as="h2"
												className="m-0 font-medium text-[13px] text-ink"
											>
												What changed
											</Heading>
										</Column>
										<Column align="right" className="text-[12px] text-faint">
											last week → this week
										</Column>
									</Row>
									{changes.map((change) => (
										<Row
											className={DIVIDER}
											key={`${change.product}-${change.metric}`}
										>
											<Column className="py-[9px] text-[14px] text-ink">
												{changeLabel(change)}
											</Column>
											<Column
												align="right"
												className="w-[120px] py-[9px] text-[13px] text-sub"
											>
												{formatCount(change.previous)} →{" "}
												{formatCount(change.current)}
											</Column>
										</Row>
									))}
								</Section>
							) : null}

							<PathList
								hint="visitors"
								rows={landingPages.map((row) => ({
									logoUrl: row.logoUrl,
									page: row.page,
									value: row.visitors,
								}))}
								title="Where AI visitors landed"
							/>
							<PathList
								hint="reads"
								rows={pages.map(({ format, page, reads: value }) => ({
									page,
									tag: FORMAT_TAGS[format],
									value,
								}))}
								title="Most read by AI"
							/>

							{shouldHideReads ? null : setupCallout}

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
	changes: [
		{ current: 13, metric: "visitors", previous: 3, product: "ChatGPT" },
		{ current: 34, metric: "visitors", previous: 0, product: "Perplexity" },
	],
	hasServerTracking: false,
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

export async function renderAiDigestEmail(props: AiDigestEmailProps) {
	const email = <AiDigestEmail {...props} />;
	const [html, text] = await Promise.all([
		render(email),
		render(email, {
			htmlToTextOptions: {
				selectors: [
					{ format: "skip", selector: "img" },
					{
						format: "dataTable",
						options: { colSpacing: 3, uppercaseHeaderCells: false },
						selector: "table",
					},
				],
			},
			plainText: true,
		}),
	]);
	return { html, text };
}

export default AiDigestEmail;
