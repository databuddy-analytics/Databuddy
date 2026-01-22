"use client";

import {
	ComputerDesktopIcon,
	MoonIcon,
	SunIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ThemeTogglerProps {
	className?: string;
	iconClassName?: string;
}

export function ThemeToggle({ className, iconClassName }: ThemeTogglerProps) {
	const { theme, setTheme } = useTheme();
	const currentTheme = theme ?? "system";

	const switchTheme = () => {
		const nextTheme =
			currentTheme === "system"
				? "light"
				: currentTheme === "light"
					? "dark"
					: "system";

		if (!("startViewTransition" in document)) {
			setTheme(nextTheme);
			return;
		}

		document.startViewTransition(() => {
			setTheme(nextTheme);
		});
	};

	const getThemeLabel = () => {
		switch (currentTheme) {
			case "light":
				return "Light mode";
			case "dark":
				return "Dark mode";
			case "system":
				return "System theme";
			default:
				return "Toggle theme";
		}
	};

	const getNextThemeLabel = () => {
		const nextTheme =
			currentTheme === "system"
				? "light"
				: currentTheme === "light"
					? "dark"
					: "system";
		switch (nextTheme) {
			case "light":
				return "Switch to light";
			case "dark":
				return "Switch to dark";
			case "system":
				return "Switch to system";
			default:
				return "Toggle theme";
		}
	};

	const iconSize = iconClassName || "size-5";

	return (
		<Tooltip delayDuration={500}>
			<TooltipTrigger asChild>
				<Button
					aria-label="Toggle theme"
					className={cn(
						"relative hidden size-8 transition-all duration-200 md:flex",
						className
					)}
					onClick={switchTheme}
					suppressHydrationWarning
					type="button"
					variant="ghost"
				>
					<SunIcon
						className={cn(
							iconSize,
							"text-muted-foreground transition-all duration-300",
							currentTheme === "light"
								? "rotate-0 scale-100"
								: "-rotate-90 scale-0"
						)}
					/>
					<MoonIcon
						className={cn(
							iconSize,
							"absolute text-muted-foreground transition-all duration-300",
							currentTheme === "dark"
								? "rotate-0 scale-100"
								: "rotate-90 scale-0"
						)}
					/>
					<ComputerDesktopIcon
						className={cn(
							iconSize,
							"absolute text-muted-foreground transition-all duration-300",
							currentTheme === "system"
								? "rotate-0 scale-100"
								: "rotate-90 scale-0"
						)}
					/>
					<span className="sr-only">Toggle theme</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8}>
				{getThemeLabel()} • {getNextThemeLabel()}
			</TooltipContent>
		</Tooltip>
	);
}
