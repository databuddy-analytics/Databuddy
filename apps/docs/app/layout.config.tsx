import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { SiDiscord, SiGithub, SiX } from "@icons-pack/react-simple-icons";
import { ChartBarIcon } from "@databuddy/ui/icons";
import { LogoContent } from "@/components/logo";

export const baseOptions: BaseLayoutProps = {
	nav: {
		enabled: false,
		title: <LogoContent />,
		transparentMode: "top",
	},
	links: [
		{
			text: "Log in",
			url: "https://app.databuddy.cc/register",
			external: true,
			icon: <ChartBarIcon />,
		},
		{
			text: "GitHub",
			url: "https://github.com/databuddy-analytics",
			external: true,
			icon: <SiGithub />,
			secondary: true,
		},
		{
			text: "Discord",
			url: "https://discord.gg/JTk7a38tCZ",
			external: true,
			icon: <SiDiscord />,
		},
		{
			text: "X (Twitter)",
			url: "https://x.com/trydatabuddy",
			external: true,
			icon: <SiX />,
		},
	],
};
