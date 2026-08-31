"use client";

import { useTheme } from "next-themes";
import { Button } from "./button";
import { Tooltip } from "./tooltip";
import { cn } from "../lib/utils";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons/nucleo";

const CYCLE = ["system", "light", "dark"] as const;

const LABELS: Record<string, string> = {
	light: "Light mode",
	dark: "Dark mode",
	system: "System theme",
};

interface ThemeToggleProps {
	className?: string;
	tooltip?: boolean;
}

export function ThemeToggle({ className, tooltip = false }: ThemeToggleProps) {
	const { theme, setTheme } = useTheme();
	const current = theme ?? "system";
	const next =
		CYCLE[
			(CYCLE.indexOf(current as (typeof CYCLE)[number]) + 1) % CYCLE.length
		];

	const switchTheme = () => {
		if ("startViewTransition" in document) {
			document.startViewTransition(() => setTheme(next));
		} else {
			setTheme(next);
		}
	};

	const button = (
		<Button
			aria-label="Toggle theme"
			className={cn("relative hidden size-7 p-0 md:flex", className)}
			onClick={switchTheme}
			suppressHydrationWarning
			variant="ghost"
		>
			<SunIcon
				className={cn(
					"size-4 shrink-0 transition-transform duration-(--duration-quick) ease-(--ease-smooth) motion-reduce:transition-none",
					current === "light" ? "scale-100" : "scale-0"
				)}
				suppressHydrationWarning
			/>
			<MoonIcon
				className={cn(
					"absolute size-4 shrink-0 transition-transform duration-(--duration-quick) ease-(--ease-smooth) motion-reduce:transition-none",
					current === "dark" ? "scale-100" : "scale-0"
				)}
				suppressHydrationWarning
			/>
			<MonitorIcon
				className={cn(
					"absolute size-4 shrink-0 transition-transform duration-(--duration-quick) ease-(--ease-smooth) motion-reduce:transition-none",
					current === "system" ? "scale-100" : "scale-0"
				)}
				suppressHydrationWarning
			/>
		</Button>
	);

	if (tooltip) {
		return (
			<Tooltip
				content={`${LABELS[current]} · Switch to ${next}`}
				delay={500}
				side="top"
			>
				{button}
			</Tooltip>
		);
	}

	return button;
}
