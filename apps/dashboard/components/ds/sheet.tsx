"use client";

import { cn } from "@/lib/utils";
import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import type { ComponentPropsWithoutRef } from "react";

type Side = "left" | "right";

function Root(props: ComponentPropsWithoutRef<typeof BaseDialog.Root>) {
	return <BaseDialog.Root {...props} />;
}

function Trigger({
	children,
	render,
	...rest
}: ComponentPropsWithoutRef<typeof BaseDialog.Trigger>) {
	return (
		<BaseDialog.Trigger render={render} {...rest}>
			{children}
		</BaseDialog.Trigger>
	);
}

const sideStyles: Record<Side, string> = {
	right:
		"right-2 data-open:animate-in data-open:slide-in-from-right not-data-open:animate-out not-data-open:slide-out-to-right",
	left: "left-2 data-open:animate-in data-open:slide-in-from-left not-data-open:animate-out not-data-open:slide-out-to-left",
};

function Content({
	className,
	children,
	side = "right",
	...rest
}: ComponentPropsWithoutRef<typeof BaseDialog.Popup> & { side?: Side }) {
	return (
		<BaseDialog.Portal>
			<BaseDialog.Backdrop
				className={cn(
					"fixed inset-0 z-50 bg-black/40",
					"data-open:fade-in data-open:animate-in data-open:duration-300",
					"not-data-open:fade-out not-data-open:animate-out not-data-open:duration-200"
				)}
			/>
			<BaseDialog.Popup
				className={cn(
					"fixed top-2 bottom-2 z-50 flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border/60 bg-card shadow-lg sm:max-w-xl",
					"data-open:duration-300 data-open:ease-out",
					"not-data-open:duration-200 not-data-open:ease-in",
					sideStyles[side],
					className
				)}
				{...rest}
			>
				{children}
			</BaseDialog.Popup>
		</BaseDialog.Portal>
	);
}

function Header({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex shrink-0 flex-col gap-1 bg-muted px-5 py-4",
				className
			)}
			{...rest}
		/>
	);
}

function Body({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("flex-1 overflow-y-auto px-5 py-4", className)}
			{...rest}
		/>
	);
}

function Footer({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-end gap-2 border-border/60 border-t bg-muted px-5 py-3",
				className
			)}
			{...rest}
		/>
	);
}

function Title({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseDialog.Title>) {
	return (
		<BaseDialog.Title
			className={cn("font-semibold text-foreground text-xs", className)}
			{...rest}
		/>
	);
}

function Description({
	className,
	...rest
}: ComponentPropsWithoutRef<typeof BaseDialog.Description>) {
	return (
		<BaseDialog.Description
			className={cn("text-muted-foreground text-xs", className)}
			{...rest}
		/>
	);
}

function Close({
	className,
	children,
	...rest
}: ComponentPropsWithoutRef<typeof BaseDialog.Close>) {
	if (children) {
		return (
			<BaseDialog.Close
				render={children as React.ReactElement<Record<string, unknown>>}
				{...rest}
			/>
		);
	}
	return (
		<BaseDialog.Close
			aria-label={rest["aria-label"] ?? "Close"}
			className={cn(
				"absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground",
				"transition-colors duration-(--duration-instant) ease-(--ease-smooth)",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				"hover:bg-interactive-hover hover:text-foreground",
				className
			)}
			{...rest}
		>
			<XIcon aria-hidden="true" className="size-3.5" />
		</BaseDialog.Close>
	);
}

export const Sheet = Object.assign(Root, {
	Trigger,
	Content,
	Header,
	Body,
	Footer,
	Title,
	Description,
	Close,
});
