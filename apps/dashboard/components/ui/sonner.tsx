"use client";

import {
	CheckCircleIcon,
	InfoIcon,
	SpinnerIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			className="toaster group"
			closeButton
			duration={2500}
			gap={8}
			icons={{
				success: (
					<CheckCircleIcon
						className="size-5 text-emerald-600 dark:text-emerald-400"
						weight="fill"
					/>
				),
				error: (
					<XCircleIcon
						className="size-5 text-red-600 dark:text-red-400"
						weight="fill"
					/>
				),
				warning: (
					<WarningCircleIcon
						className="size-5 text-amber-600 dark:text-amber-400"
						weight="fill"
					/>
				),
				info: (
					<InfoIcon
						className="size-5 text-blue-600 dark:text-blue-400"
						weight="fill"
					/>
				),
				loading: (
					<SpinnerIcon className="size-5 animate-spin text-foreground" />
				),
			}}
			offset={16}
			position="top-center"
			theme={theme as ToasterProps["theme"]}
			toastOptions={{
				classNames: {
					toast:
						"group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:rounded",
					title: "group-[.toast]:font-semibold group-[.toast]:text-foreground group-[.toast]:text-sm",
					description:
						"group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
					actionButton:
						"group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded group-[.toast]:text-xs group-[.toast]:font-medium",
					cancelButton:
						"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded group-[.toast]:text-xs",
					closeButton:
						"group-[.toast]:border-border group-[.toast]:bg-background group-[.toast]:text-muted-foreground hover:group-[.toast]:bg-accent hover:group-[.toast]:text-foreground",
					success:
						"group-[.toaster]:!border-emerald-600/50 group-[.toaster]:!bg-emerald-50 group-[.toaster]:!text-emerald-950 dark:group-[.toaster]:!bg-emerald-950 dark:group-[.toaster]:!text-emerald-50 dark:group-[.toaster]:!border-emerald-500/50",
					error:
						"group-[.toaster]:!border-red-600/50 group-[.toaster]:!bg-red-50 group-[.toaster]:!text-red-950 dark:group-[.toaster]:!bg-red-950 dark:group-[.toaster]:!text-red-50 dark:group-[.toaster]:!border-red-500/50",
					warning:
						"group-[.toaster]:!border-amber-600/50 group-[.toaster]:!bg-amber-50 group-[.toaster]:!text-amber-950 dark:group-[.toaster]:!bg-amber-950 dark:group-[.toaster]:!text-amber-50 dark:group-[.toaster]:!border-amber-500/50",
					info: "group-[.toaster]:!border-blue-600/50 group-[.toaster]:!bg-blue-50 group-[.toaster]:!text-blue-950 dark:group-[.toaster]:!bg-blue-950 dark:group-[.toaster]:!text-blue-50 dark:group-[.toaster]:!border-blue-500/50",
				},
			}}
			visibleToasts={4}
			{...props}
		/>
	);
}

export { Toaster };
