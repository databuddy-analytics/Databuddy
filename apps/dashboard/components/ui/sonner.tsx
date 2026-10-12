"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
	CheckCircleIcon,
	InfoIcon,
	SpinnerIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@databuddy/ui/icons";

function Toaster({ ...props }: ToasterProps) {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			className="toaster group"
			closeButton
			duration={2500}
			gap={8}
			icons={{
				success: <CheckCircleIcon className="size-5 text-success" />,
				error: <XCircleIcon className="size-5 text-destructive" />,
				warning: <WarningCircleIcon className="size-5 text-warning" />,
				info: <InfoIcon className="size-5 text-muted-foreground" />,
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
					title:
						"group-[.toast]:font-semibold group-[.toast]:text-foreground group-[.toast]:text-sm",
					description:
						"group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
					actionButton:
						"group-[.toast]:bg-brand-purple group-[.toast]:text-white group-[.toast]:rounded group-[.toast]:text-xs group-[.toast]:font-medium",
					cancelButton:
						"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded group-[.toast]:text-xs",
					closeButton:
						"group-[.toast]:border-border group-[.toast]:bg-background group-[.toast]:text-muted-foreground hover:group-[.toast]:bg-accent hover:group-[.toast]:text-foreground",
					success: "group-[.toaster]:!border-success/50",
					error: "group-[.toaster]:!border-destructive/50",
					warning: "group-[.toaster]:!border-warning/50",
				},
			}}
			visibleToasts={4}
			{...props}
		/>
	);
}

export { Toaster };
