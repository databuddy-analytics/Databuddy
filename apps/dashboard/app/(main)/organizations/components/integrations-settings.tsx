"use client";

import { authClient } from "@databuddy/auth/client";
import { publicConfig } from "@databuddy/env/public";
import type { SlackIntegrationOutput } from "@databuddy/rpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import type { Organization } from "@/hooks/use-organizations";
import { orpc } from "@/lib/orpc";
import {
	CheckCircleIcon,
	ClockIcon,
	MsgContentIcon,
	PlugIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import {
	Badge,
	Button,
	Card,
	Input,
	Skeleton,
	Text,
	buttonVariants,
	cn,
	dayjs,
} from "@databuddy/ui";
import { Accordion, Autocomplete, DeleteDialog } from "@databuddy/ui/client";

type SlackIntegration = SlackIntegrationOutput;

interface IntegrationCatalogItem {
	accent: string;
	accentClassName?: string;
	category: string;
	description: string;
	iconPath: string;
	id: string;
	name: string;
}

const SIMPLE_ICONS = {
	slack:
		"M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
	github:
		"M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
	linear:
		"M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z",
	stripe:
		"M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z",
	discord:
		"M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
	cloudflare:
		"M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727",
	googlesearchconsole:
		"M8.548 1.156L6.832 2.872v1.682h1.716zm0 3.398v.035H6.832v-.035H3.386L0 7.844v3.577h2.826V8.94c0-.525.429-.954.954-.954h16.476c.525 0 .954.43.954.954v2.48h2.754V7.844l-3.386-3.29H17.3v.035h-1.717v-.035zm7.035 0H17.3V2.872l-1.717-1.716zM8.679 1.188V2.84h6.773V1.188zm11.471 7.07a.834.834 0 00-.132.01l-.543.002c-5.216.014-10.432-.008-15.648.01-.435-.063-.794.436-.716.883v2.264h17.812c-.016-.888.045-1.782-.034-2.666-.104-.342-.427-.502-.739-.502zm-15.422.634a.689.698 0 01.689.698.689.698 0 01-.689.697.689.698 0 01-.688-.697.689.698 0 01.688-.698zm2.134 0a.689.698 0 01.689.698.689.698 0 01-.689.697.689.698 0 01-.688-.697.689.698 0 01.688-.698zM.036 11.645v9.156c0 1.05.858 1.908 1.907 1.908h.883V11.645zm21.174 0v11.064h.882c1.05 0 1.908-.858 1.908-1.908v-9.156zM4.057 13.133v6.85h6.137v-6.85zm13.243.021v3.777l-1.708.977-1.708-.977v-3.758a4.006 4.006 0 000 7.23v2.441h3.457v-2.442a4.006 4.006 0 00-.041-7.248zm-13.243 8.26v1.43h7.925v-1.43z",
	googleAnalytics:
		"M22.84 2.9982v17.9987c.0086 1.6473-1.3197 2.9897-2.967 2.9984a2.9808 2.9808 0 01-.3677-.0208c-1.528-.226-2.6477-1.5558-2.6105-3.1V3.1204c-.0369-1.5458 1.0856-2.8762 2.6157-3.1 1.6361-.1915 3.1178.9796 3.3093 2.6158.014.1201.0208.241.0202.3619zM4.1326 18.0548c-1.6417 0-2.9726 1.331-2.9726 2.9726C1.16 22.6691 2.4909 24 4.1326 24s2.9726-1.3309 2.9726-2.9726-1.331-2.9726-2.9726-2.9726zm7.8728-9.0098c-.0171 0-.0342 0-.0513.0003-1.6495.0904-2.9293 1.474-2.891 3.1256v7.9846c0 2.167.9535 3.4825 2.3505 3.763 1.6118.3266 3.1832-.7152 3.5098-2.327.04-.1974.06-.3983.0593-.5998v-8.9585c.003-1.6474-1.33-2.9852-2.9773-2.9882z",
	notion:
		"M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z",
	posthog:
		"M9.854 14.5 5 9.647.854 5.5A.5.5 0 0 0 0 5.854V8.44a.5.5 0 0 0 .146.353L5 13.647l.147.146L9.854 18.5l.146.147v-.049c.065.03.134.049.207.049h2.586a.5.5 0 0 0 .353-.854L9.854 14.5zm0-5-4-4a.487.487 0 0 0-.409-.144.515.515 0 0 0-.356.21.493.493 0 0 0-.089.288V8.44a.5.5 0 0 0 .147.353l9 9a.5.5 0 0 0 .853-.354v-2.585a.5.5 0 0 0-.146-.354l-5-5zm1-4a.5.5 0 0 0-.854.354V8.44a.5.5 0 0 0 .147.353l4 4a.5.5 0 0 0 .853-.354V9.854a.5.5 0 0 0-.146-.354l-4-4zm12.647 11.515a3.863 3.863 0 0 1-2.232-1.1l-4.708-4.707a.5.5 0 0 0-.854.354v6.585a.5.5 0 0 0 .5.5H23.5a.5.5 0 0 0 .5-.5v-.6c0-.276-.225-.497-.499-.532zm-5.394.032a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6zM.854 15.5a.5.5 0 0 0-.854.354v2.293a.5.5 0 0 0 .5.5h2.293c.222 0 .39-.135.462-.309a.493.493 0 0 0-.109-.545L.854 15.501zM5 14.647.854 10.5a.5.5 0 0 0-.854.353v2.586a.5.5 0 0 0 .146.353L4.854 18.5l.146.147h2.793a.5.5 0 0 0 .353-.854L5 14.647z",
	sentry:
		"M13.91 2.505c-.873-1.448-2.972-1.448-3.844 0L6.904 7.92a15.478 15.478 0 0 1 8.53 12.811h-2.221A13.301 13.301 0 0 0 5.784 9.814l-2.926 5.06a7.65 7.65 0 0 1 4.435 5.848H2.194a.365.365 0 0 1-.298-.534l1.413-2.402a5.16 5.16 0 0 0-1.614-.913L.296 19.275a2.182 2.182 0 0 0 .812 2.999 2.24 2.24 0 0 0 1.086.288h6.983a9.322 9.322 0 0 0-3.845-8.318l1.11-1.922a11.47 11.47 0 0 1 4.95 10.24h5.915a17.242 17.242 0 0 0-7.885-15.28l2.244-3.845a.37.37 0 0 1 .504-.13c.255.14 9.75 16.708 9.928 16.9a.365.365 0 0 1-.327.543h-2.287c.029.612.029 1.223 0 1.831h2.297a2.206 2.206 0 0 0 1.922-3.31z",
	vercel: "m12 1.608 12 20.784H0Z",
	figma:
		"M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z",
};

const SLACK_ITEM: IntegrationCatalogItem = {
	accent: "#611f69",
	category: "AI agent",
	description: "Ask Databuddy analytics questions from Slack channels and DMs.",
	iconPath: SIMPLE_ICONS.slack,
	id: "slack",
	name: "Slack",
};

const GITHUB_ITEM: IntegrationCatalogItem = {
	accent: "#181717",
	category: "Intelligence",
	description:
		"Correlate deploys, commits, and PRs with traffic and error changes.",
	accentClassName: "bg-foreground/70",
	iconPath: SIMPLE_ICONS.github,
	id: "github",
	name: "GitHub",
};

const GITHUB_SCOPES = ["repo:status", "read:org"];

const GSC_ITEM: IntegrationCatalogItem = {
	accent: "#4285F4",
	category: "Intelligence",
	description:
		"Surface keyword ranking changes, impression drops, and CTR shifts in investigations.",
	iconPath: SIMPLE_ICONS.googlesearchconsole,
	id: "google-search-console",
	name: "Google Search Console",
};

const GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

const COMING_SOON_INTEGRATIONS: IntegrationCatalogItem[] = [
	{
		accent: "#5E6AD2",
		category: "Product ops",
		description: "Link conversion shifts and anomalies to issues and roadmaps.",
		iconPath: SIMPLE_ICONS.linear,
		id: "linear",
		name: "Linear",
	},
	{
		accent: "#635BFF",
		category: "Revenue",
		description: "Join payment events, subscriptions, and revenue analytics.",
		iconPath: SIMPLE_ICONS.stripe,
		id: "stripe",
		name: "Stripe",
	},
	{
		accent: "#5865F2",
		category: "Alerts",
		description:
			"Route monitor, anomaly, and agent notifications into Discord.",
		iconPath: SIMPLE_ICONS.discord,
		id: "discord",
		name: "Discord",
	},
	{
		accent: "#E37400",
		category: "Import",
		description: "Import historical traffic when teams migrate into Databuddy.",
		iconPath: SIMPLE_ICONS.googleAnalytics,
		id: "google-analytics",
		name: "Google Analytics",
	},
	{
		accent: "#000000",
		category: "Deployments",
		description:
			"Correlate Vercel deploys and previews with analytics outcomes.",
		accentClassName: "bg-foreground/70",
		iconPath: SIMPLE_ICONS.vercel,
		id: "vercel",
		name: "Vercel",
	},
	{
		accent: "#F38020",
		category: "Edge",
		description:
			"Connect edge traffic, cache signals, and site performance context.",
		iconPath: SIMPLE_ICONS.cloudflare,
		id: "cloudflare",
		name: "Cloudflare",
	},
	{
		accent: "#362D59",
		category: "Errors",
		description: "Join frontend/backend exceptions with affected sessions.",
		iconPath: SIMPLE_ICONS.sentry,
		id: "sentry",
		name: "Sentry",
	},
	{
		accent: "#000000",
		category: "Migration",
		description: "Bring events and cohorts across from PostHog workspaces.",
		accentClassName: "bg-foreground/70",
		iconPath: SIMPLE_ICONS.posthog,
		id: "posthog",
		name: "PostHog",
	},
	{
		accent: "#000000",
		category: "Docs",
		description: "Publish recurring analytics summaries to team docs.",
		accentClassName: "bg-foreground/70",
		iconPath: SIMPLE_ICONS.notion,
		id: "notion",
		name: "Notion",
	},
	{
		accent: "#F24E1E",
		category: "Design",
		description: "Attach launch notes and experiment context from design work.",
		iconPath: SIMPLE_ICONS.figma,
		id: "figma",
		name: "Figma",
	},
];

function slackInstallUrl(organizationId: string): string {
	const url = new URL("/v1/integrations/slack/install", publicConfig.urls.api);
	url.searchParams.set("organizationId", organizationId);
	return url.toString();
}

function useLinkedAccounts() {
	return useQuery({
		queryKey: ["linked-accounts"],
		queryFn: async () => {
			const result = await authClient.listAccounts();
			return result.data ?? [];
		},
	});
}

function useOAuthConnect(provider: string, scopes: string[], label: string) {
	return useMutation({
		mutationFn: async () => {
			const result = await authClient.linkSocial({
				provider,
				scopes,
				callbackURL: window.location.href,
			});
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onError: (err) => {
			toast.error(err.message || `Could not connect ${label}`);
		},
	});
}

function ConnectionBadge({
	connected,
	loading,
}: {
	connected: boolean;
	loading: boolean;
}) {
	if (loading) {
		return (
			<Badge size="sm" variant="muted">
				Checking
			</Badge>
		);
	}
	if (connected) {
		return (
			<Badge size="sm" variant="success">
				Connected
			</Badge>
		);
	}
	return (
		<Badge size="sm" variant="warning">
			Not connected
		</Badge>
	);
}

function LoadingButton() {
	return (
		<Button disabled size="sm" variant="secondary">
			<ClockIcon className="size-4" />
			Checking
		</Button>
	);
}

export function IntegrationsSettingsSkeleton() {
	return (
		<div className="mx-auto max-w-4xl p-5">
			<Card>
				<Card.Header>
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-3 w-72" />
				</Card.Header>
				<Card.Content className="p-0">
					{Array.from({ length: 8 }, (_, index) => (
						<div
							className="flex items-center gap-3 border-border/60 border-b px-5 py-4 last:border-b-0"
							key={index}
						>
							<Skeleton className="size-10 rounded" />
							<div className="min-w-0 flex-1 space-y-2">
								<Skeleton className="h-3.5 w-40" />
								<Skeleton className="h-3 w-72" />
							</div>
							<Skeleton className="h-6 w-20 rounded-full" />
						</div>
					))}
				</Card.Content>
			</Card>
		</div>
	);
}

export function IntegrationsSettings({
	organization,
}: {
	organization: Organization;
}) {
	const queryClient = useQueryClient();
	const searchParams = useSearchParams();
	const [pendingUninstall, setPendingUninstall] =
		useState<SlackIntegration | null>(null);
	const listKey = orpc.integrations.list.key({
		input: { organizationId: organization.id },
	});

	useEffect(() => {
		const slackResult = searchParams.get("slack");
		if (slackResult === "connected") {
			toast.success("Slack workspace connected");
		}
		if (slackResult === "error") {
			toast.error(searchParams.get("message") ?? "Slack install failed");
		}
	}, [searchParams]);

	const integrationsQuery = useQuery({
		...orpc.integrations.list.queryOptions({
			input: { organizationId: organization.id },
		}),
	});

	const uninstallSlack = useMutation({
		...orpc.integrations.uninstallSlack.mutationOptions(),
		onError: () => {
			toast.error("Could not uninstall Slack");
		},
		onSuccess: async () => {
			toast.success("Slack uninstalled");
			await queryClient.invalidateQueries({ queryKey: listKey });
		},
	});

	const slackIntegrations = (integrationsQuery.data?.slack ??
		[]) as SlackIntegration[];

	return (
		<div className="flex h-full flex-col">
			<TopBar.Breadcrumbs
				items={[
					{ label: "Settings", href: "/organizations/settings" },
					{ label: "Integrations" },
				]}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-4xl p-5">
					<Card>
						<Card.Header>
							<Card.Title>Integrations</Card.Title>
							<Card.Description>
								Connect Databuddy to the tools your organization already uses
							</Card.Description>
						</Card.Header>

						<Card.Content className="p-0">
							<SlackIntegrationRow
								integrations={slackIntegrations}
								isLoading={integrationsQuery.isLoading}
								onUninstall={setPendingUninstall}
								organizationId={organization.id}
								uninstallingId={
									uninstallSlack.isPending
										? uninstallSlack.variables?.integrationId
										: undefined
								}
							/>

							<GitHubIntegrationRow organizationId={organization.id} />

							<GSCIntegrationRow />

							{COMING_SOON_INTEGRATIONS.map((item) => (
								<IntegrationListRow
									action={
										<Button disabled size="sm" variant="secondary">
											<ClockIcon className="size-4" />
											Soon
										</Button>
									}
									badge={
										<Badge size="sm" variant="muted">
											Coming soon
										</Badge>
									}
									item={item}
									key={item.id}
								/>
							))}
						</Card.Content>
					</Card>
				</div>
			</div>

			{pendingUninstall && (
				<DeleteDialog
					confirmLabel="Uninstall Slack"
					description={`${pendingUninstall.teamName ?? pendingUninstall.teamId} will be disconnected from Databuddy. Channel bindings will be removed and the Slack agent API key will be revoked.`}
					isDeleting={uninstallSlack.isPending}
					isOpen={Boolean(pendingUninstall)}
					onClose={() => setPendingUninstall(null)}
					onConfirm={async () => {
						await uninstallSlack.mutateAsync({
							integrationId: pendingUninstall.id,
							organizationId: organization.id,
						});
					}}
					title="Uninstall Slack?"
				/>
			)}
		</div>
	);
}

function GSCIntegrationRow() {
	const accounts = useLinkedAccounts();
	const googleAccount = accounts.data?.find((a) => a.providerId === "google");

	const gscCheck = useQuery({
		...orpc.integrations.checkSearchConsoleAccess.queryOptions({
			input: {},
		}),
		enabled: Boolean(googleAccount),
	});

	const hasGscAccess = gscCheck.data?.hasAccess === true;
	const connect = useOAuthConnect(
		"google",
		GSC_SCOPES,
		"Google Search Console"
	);

	let action: React.ReactNode;
	if (accounts.isLoading || gscCheck.isLoading) {
		action = <LoadingButton />;
	} else if (hasGscAccess) {
		action = (
			<Button disabled size="sm" variant="secondary">
				<CheckCircleIcon className="size-4" />
				Connected
			</Button>
		);
	} else {
		action = (
			<Button
				disabled={connect.isPending}
				loading={connect.isPending}
				onClick={() => connect.mutate()}
				size="sm"
				variant="secondary"
			>
				<PlugIcon className="size-4" />
				{googleAccount ? "Grant access" : "Connect"}
			</Button>
		);
	}

	return (
		<IntegrationListRow
			action={action}
			badge={
				<ConnectionBadge
					connected={hasGscAccess}
					loading={accounts.isLoading || gscCheck.isLoading}
				/>
			}
			item={GSC_ITEM}
		/>
	);
}

function GitHubIntegrationRow({ organizationId }: { organizationId: string }) {
	const queryClient = useQueryClient();
	const accounts = useLinkedAccounts();
	const githubAccount = accounts.data?.find((a) => a.providerId === "github");
	const canDisconnect = (accounts.data?.length ?? 0) > 1;

	const websitesQuery = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(githubAccount),
	});

	const connect = useOAuthConnect("github", GITHUB_SCOPES, "GitHub");

	const disconnect = useMutation({
		mutationFn: async () => {
			const result = await authClient.unlinkAccount({ providerId: "github" });
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onSuccess: async () => {
			toast.success("GitHub disconnected");
			await queryClient.invalidateQueries({ queryKey: ["linked-accounts"] });
		},
		onError: (err) => {
			toast.error(err.message || "Could not disconnect GitHub");
		},
	});

	const invalidateWebsites = () =>
		queryClient.invalidateQueries({ queryKey: orpc.websites.key() });

	const setRepo = useMutation({
		...orpc.integrations.setGitHubRepo.mutationOptions(),
		onSuccess: async () => {
			toast.success("Repository linked");
			await invalidateWebsites();
		},
		onError: () => {
			toast.error("Could not link repository");
		},
	});

	const removeRepo = useMutation({
		...orpc.integrations.removeGitHubRepo.mutationOptions(),
		onSuccess: async () => {
			toast.success("Repository unlinked");
			await invalidateWebsites();
		},
		onError: () => {
			toast.error("Could not unlink repository");
		},
	});

	let action: React.ReactNode;
	if (accounts.isLoading) {
		action = <LoadingButton />;
	} else if (githubAccount) {
		action = (
			<div className="flex items-center gap-2">
				{canDisconnect && (
					<Button
						disabled={disconnect.isPending}
						loading={disconnect.isPending}
						onClick={() => disconnect.mutate()}
						size="sm"
						variant="ghost"
					>
						<TrashIcon className="size-4" />
						Disconnect
					</Button>
				)}
				<Button disabled size="sm" variant="secondary">
					<CheckCircleIcon className="size-4" />
					Connected
				</Button>
			</div>
		);
	} else {
		action = (
			<Button
				disabled={connect.isPending}
				loading={connect.isPending}
				onClick={() => connect.mutate()}
				size="sm"
				variant="secondary"
			>
				<PlugIcon className="size-4" />
				Connect
			</Button>
		);
	}

	return (
		<IntegrationListRow
			action={action}
			badge={
				<ConnectionBadge
					connected={Boolean(githubAccount)}
					loading={accounts.isLoading}
				/>
			}
			defaultOpen={false}
			item={GITHUB_ITEM}
		>
			{githubAccount && (
				<GitHubRepoMappings
					isLoading={websitesQuery.isLoading}
					onRemove={(websiteId) => removeRepo.mutate({ websiteId })}
					onSet={(websiteId, owner, repo) =>
						setRepo.mutate({ websiteId, owner, repo })
					}
					removingId={
						removeRepo.isPending ? removeRepo.variables?.websiteId : undefined
					}
					settingId={
						setRepo.isPending ? setRepo.variables?.websiteId : undefined
					}
					websites={websitesQuery.data ?? []}
				/>
			)}
		</IntegrationListRow>
	);
}

function GitHubRepoMappings({
	isLoading,
	onRemove,
	onSet,
	removingId,
	settingId,
	websites,
}: {
	isLoading: boolean;
	onRemove: (websiteId: string) => void;
	onSet: (websiteId: string, owner: string, repo: string) => void;
	removingId?: string;
	settingId?: string;
	websites: Array<{
		id: string;
		domain: string;
		integrations?: { github?: { owner: string; repo: string } } | null;
	}>;
}) {
	const reposQuery = useQuery({
		...orpc.integrations.listGitHubRepos.queryOptions({ input: {} }),
	});
	const repoNames = (reposQuery.data?.repos ?? []).map((r) => r.fullName);

	const [manualId, setManualId] = useState<string | null>(null);
	const [manualInput, setManualInput] = useState("");

	if (isLoading) {
		return (
			<div className="rounded border border-border/60 bg-secondary/30">
				<IntegrationDetailSkeleton />
			</div>
		);
	}

	if (websites.length === 0) {
		return (
			<div className="rounded border border-border/60 bg-secondary/30 px-3 py-2">
				<Text tone="muted" variant="caption">
					No websites in this organization.
				</Text>
			</div>
		);
	}

	function handleSelect(websiteId: string, fullName: string) {
		const [owner, repo] = fullName.split("/");
		if (owner && repo) {
			onSet(websiteId, owner, repo);
		}
	}

	function handleManualSubmit(websiteId: string) {
		const parts = manualInput.trim().split("/");
		if (parts.length === 2 && parts[0] && parts[1]) {
			onSet(websiteId, parts[0], parts[1]);
			setManualId(null);
			setManualInput("");
		} else {
			toast.error("Enter owner/repo format");
		}
	}

	return (
		<div className="rounded border border-border/60 bg-secondary/30">
			<div className="border-border/60 border-b px-3 py-2">
				<Text tone="muted" variant="caption">
					Link a GitHub repository to each website so Databuddy can correlate
					deploys and commits with traffic changes.
				</Text>
			</div>
			{websites.map((site) => {
				const gh = site.integrations?.github;
				const isManual = manualId === site.id;

				return (
					<div
						className="flex flex-wrap items-center gap-2 border-border/60 border-b px-3 py-2.5 last:border-b-0"
						key={site.id}
					>
						<span className="min-w-0 flex-1 truncate font-mono text-foreground text-xs">
							{site.domain}
						</span>

						{gh ? (
							<div className="flex items-center gap-2">
								<span className="font-mono text-muted-foreground text-xs">
									{gh.owner}/{gh.repo}
								</span>
								<Button
									loading={removingId === site.id}
									onClick={() => onRemove(site.id)}
									size="sm"
									variant="ghost"
								>
									<TrashIcon className="size-3.5" />
								</Button>
							</div>
						) : isManual ? (
							<form
								className="flex items-center gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									handleManualSubmit(site.id);
								}}
							>
								<Input
									autoFocus
									className="h-7 w-48 font-mono text-xs"
									onChange={(e) => setManualInput(e.target.value)}
									placeholder="owner/repo"
									value={manualInput}
								/>
								<Button size="sm" type="submit" variant="secondary">
									Save
								</Button>
								<Button
									onClick={() => setManualId(null)}
									size="sm"
									type="button"
									variant="ghost"
								>
									Cancel
								</Button>
							</form>
						) : (
							<div className="flex items-center gap-2">
								<RepoSelector
									disabled={reposQuery.isLoading || settingId === site.id}
									onSelect={(fullName) => handleSelect(site.id, fullName)}
									placeholder={
										reposQuery.isLoading ? "Loading..." : "Search repos..."
									}
									repos={repoNames}
								/>
								<Button
									onClick={() => {
										setManualId(site.id);
										setManualInput("");
									}}
									size="sm"
									variant="ghost"
								>
									Manual
								</Button>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function RepoSelector({
	disabled,
	onSelect,
	placeholder,
	repos,
}: {
	disabled?: boolean;
	onSelect: (fullName: string) => void;
	placeholder?: string;
	repos: string[];
}) {
	const [value, setValue] = useState("");
	const [open, setOpen] = useState(false);

	const filtered = repos.filter((r) =>
		value ? r.toLowerCase().includes(value.toLowerCase()) : true
	);

	return (
		<Autocomplete
			items={filtered}
			mode="none"
			onOpenChange={setOpen}
			onValueChange={(next) => {
				setValue(next);
				if (repos.includes(next)) {
					onSelect(next);
					setValue("");
					setOpen(false);
				}
			}}
			open={open}
			value={value}
		>
			<Autocomplete.Input
				className="h-7 w-56 font-mono text-xs"
				disabled={disabled}
				onFocus={() => setOpen(true)}
				placeholder={placeholder}
			/>
			{filtered.length > 0 ? (
				<Autocomplete.Content>
					{filtered.map((name) => (
						<Autocomplete.Item key={name} value={name}>
							{name}
						</Autocomplete.Item>
					))}
				</Autocomplete.Content>
			) : (
				<Autocomplete.Content>
					<Autocomplete.Empty>No matching repos</Autocomplete.Empty>
				</Autocomplete.Content>
			)}
		</Autocomplete>
	);
}

function SlackIntegrationRow({
	integrations,
	isLoading,
	onUninstall,
	organizationId,
	uninstallingId,
}: {
	integrations: SlackIntegration[];
	isLoading: boolean;
	onUninstall: (integration: SlackIntegration) => void;
	organizationId: string;
	uninstallingId?: string;
}) {
	const connected = integrations.some((i) => i.status === "active");

	let action: React.ReactNode;
	if (isLoading) {
		action = <LoadingButton />;
	} else if (connected) {
		action = (
			<Button disabled size="sm" variant="secondary">
				<CheckCircleIcon className="size-4" />
				Connected
			</Button>
		);
	} else {
		action = (
			<a
				className={buttonVariants({ size: "sm", variant: "secondary" })}
				href={slackInstallUrl(organizationId)}
			>
				<PlugIcon className="size-4" />
				Connect
			</a>
		);
	}

	return (
		<IntegrationListRow
			action={action}
			badge={<ConnectionBadge connected={connected} loading={isLoading} />}
			defaultOpen={false}
			item={SLACK_ITEM}
		>
			<SlackIntegrationDetails
				integrations={integrations}
				isLoading={isLoading}
				onUninstall={onUninstall}
				uninstallingIntegrationId={uninstallingId}
			/>
		</IntegrationListRow>
	);
}

function IntegrationListRow({
	action,
	badge,
	children,
	defaultOpen,
	item,
}: {
	action: React.ReactNode;
	badge: React.ReactNode;
	children?: React.ReactNode;
	defaultOpen?: boolean;
	item: IntegrationCatalogItem;
}) {
	const header = (
		<>
			<IntegrationLogo item={item} />
			<div className="min-w-0">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<h3 className="truncate font-semibold text-foreground text-sm">
						{item.name}
					</h3>
					{badge}
					<Badge size="sm" variant="muted">
						{item.category}
					</Badge>
				</div>
				<Text className="mt-1" tone="muted" variant="caption">
					{item.description}
				</Text>
			</div>
		</>
	);

	if (!children) {
		return (
			<div className="border-border/60 border-b px-5 py-4 last:border-b-0">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
					<div className="flex shrink-0 items-center gap-2 sm:justify-end">
						{action}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="border-border/60 border-b last:border-b-0">
			<Accordion defaultOpen={defaultOpen}>
				<div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
					<Accordion.Trigger className="h-auto min-w-0 flex-1 bg-transparent px-0 py-0 hover:bg-transparent">
						{header}
					</Accordion.Trigger>
					<div className="flex shrink-0 items-center gap-2 sm:justify-end">
						{action}
					</div>
				</div>
				<Accordion.Panel>
					<div className="px-5 pb-4">{children}</div>
				</Accordion.Panel>
			</Accordion>
		</div>
	);
}

function IntegrationLogo({ item }: { item: IntegrationCatalogItem }) {
	return (
		<span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-border/70 bg-secondary/60 text-foreground shadow-sm">
			<span
				className={cn(
					"absolute inset-x-1.5 bottom-1 h-0.5 rounded-full",
					item.accentClassName
				)}
				style={
					item.accentClassName ? undefined : { backgroundColor: item.accent }
				}
			/>
			<SimpleBrandIcon className="relative size-5" path={item.iconPath} />
		</span>
	);
}

function SlackIntegrationDetails({
	integrations,
	isLoading,
	onUninstall,
	uninstallingIntegrationId,
}: {
	integrations: SlackIntegration[];
	isLoading: boolean;
	onUninstall: (integration: SlackIntegration) => void;
	uninstallingIntegrationId?: string;
}) {
	if (isLoading) {
		return (
			<div className="rounded border border-border/60 bg-secondary/30">
				<IntegrationDetailSkeleton />
				<IntegrationDetailSkeleton />
			</div>
		);
	}

	if (integrations.length === 0) {
		return (
			<div className="rounded border border-border/60 bg-secondary/30 px-3 py-2">
				<Text tone="muted" variant="caption">
					No Slack workspace is connected. Connect Slack to install the bot for
					this organization.
				</Text>
			</div>
		);
	}

	return (
		<div className="rounded border border-border/60 bg-secondary/30">
			{integrations.map((integration) => (
				<SlackWorkspaceRow
					integration={integration}
					isUninstalling={uninstallingIntegrationId === integration.id}
					key={integration.id}
					onUninstall={() => onUninstall(integration)}
				/>
			))}
		</div>
	);
}

function IntegrationDetailSkeleton() {
	return (
		<div className="flex items-center gap-3 border-border/60 border-b px-3 py-3 last:border-b-0">
			<Skeleton className="size-8 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<Skeleton className="h-3.5 w-32" />
				<Skeleton className="h-3 w-24" />
			</div>
			<Skeleton className="h-8 w-44 rounded-md" />
		</div>
	);
}

function SlackWorkspaceRow({
	integration,
	isUninstalling,
	onUninstall,
}: {
	integration: SlackIntegration;
	isUninstalling: boolean;
	onUninstall: () => void;
}) {
	const teamName = integration.teamName ?? integration.teamId;

	return (
		<div className="border-border/60 border-b px-3 py-3 last:border-b-0">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate font-semibold text-foreground text-xs">
							{teamName}
						</span>
						{integration.status === "active" ? (
							<Badge size="sm" variant="success">
								Active
							</Badge>
						) : (
							<Badge size="sm" variant="muted">
								Disabled
							</Badge>
						)}
					</div>
					<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
						<span className="font-mono">{integration.teamId}</span>
						<span>Organization connected</span>
						<span>{integration.channelBindings.length} channels</span>
						<span>Updated {dayjs(integration.updatedAt).fromNow()}</span>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						loading={isUninstalling}
						onClick={onUninstall}
						size="sm"
						tone="destructive"
						variant="secondary"
					>
						<TrashIcon className="size-3.5" />
						Uninstall
					</Button>
				</div>
			</div>

			<div className="mt-3 rounded border border-border/60 bg-background px-3 py-2">
				<Text tone="muted" variant="caption">
					Slack is connected at the organization level. The agent can discover
					websites itself when an analytics question needs one. Mention
					Databuddy in an internal channel and it will connect that channel
					automatically. Use <SlackCommand value="/bind" /> for Slack Connect
					channels that are approved for Databuddy answers.
				</Text>
			</div>

			<div className="mt-3 rounded border border-border/60 bg-background">
				{integration.channelBindings.length > 0 ? (
					integration.channelBindings.map((binding) => (
						<div
							className="flex items-center gap-3 border-border/60 border-b px-3 py-2 last:border-b-0"
							key={binding.id}
						>
							<MsgContentIcon className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
								{binding.slackChannelId}
							</span>
							<span className="truncate text-foreground text-xs">
								Connected channel
							</span>
						</div>
					))
				) : (
					<div className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs">
						<MsgContentIcon className="size-3.5 shrink-0" />
						<span>
							No channel bindings yet. Internal channels connect on first
							mention; Slack Connect channels require{" "}
							<SlackCommand value="/bind" /> first.
						</span>
					</div>
				)}
			</div>
		</div>
	);
}

function SlackCommand({ value }: { value: string }) {
	return (
		<code className="rounded border border-border/60 bg-secondary px-1.5 py-0.5 font-mono text-foreground text-xs">
			{value}
		</code>
	);
}

function SimpleBrandIcon({
	className,
	path,
}: {
	className?: string;
	path: string;
}) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<path d={path} />
		</svg>
	);
}
