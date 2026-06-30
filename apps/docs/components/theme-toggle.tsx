"use client";

import { MoonIcon, SunIcon } from "@databuddy/ui/icons";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface ThemeToggleProps {
	className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	const cycle = () => {
		const next = resolvedTheme === "light" ? "dark" : "light";
		if ("startViewTransition" in document) {
			document.startViewTransition(() => setTheme(next));
		} else {
			setTheme(next);
		}
	};

	const Icon = mounted && resolvedTheme === "dark" ? MoonIcon : SunIcon;

	return (
		<button
			aria-label="Toggle theme"
			className={className}
			onClick={cycle}
			type="button"
		>
			<Icon className="size-4" weight="duotone" />
		</button>
	);
}
