"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeTogglerProps = {
	className?: string;
};

export function ThemeToggle({ className }: ThemeTogglerProps) {
	const { theme, setTheme } = useTheme();
	const currentTheme = theme ?? "system";

	const switchTheme = () => {
		if (currentTheme === "system") {
			setTheme("light");
		} else if (currentTheme === "light") {
			setTheme("dark");
		} else {
			setTheme("system");
		}
	};

	return (
		<Button
			aria-label="Toggle theme"
			className={cn(
				"relative hidden h-8 w-8 transition-all duration-200 hover:bg-accent/50 md:flex",
				className
			)}
			onClick={switchTheme}
			suppressHydrationWarning
			type="button"
			variant="ghost"
		>
			<SunIcon
				className={cn(
					"size-5 not-dark:text-primary transition-all duration-300",
					currentTheme === "light" ? "rotate-0 scale-100" : "-rotate-90 scale-0"
				)}
				size={32}
				suppressHydrationWarning
				weight="duotone"
			/>
			<MoonIcon
				className={cn(
					"absolute size-5 not-dark:text-primary transition-all duration-300",
					currentTheme === "dark" ? "rotate-0 scale-100" : "rotate-90 scale-0"
				)}
				size={32}
				suppressHydrationWarning
				weight="duotone"
			/>
			<MonitorIcon
				className={cn(
					"absolute size-5 not-dark:text-primary transition-all duration-300",
					currentTheme === "system" ? "rotate-0 scale-100" : "rotate-90 scale-0"
				)}
				size={32}
				suppressHydrationWarning
				weight="duotone"
			/>
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
