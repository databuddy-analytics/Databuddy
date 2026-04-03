import type { IconProps } from "@phosphor-icons/react";
import { BookOpenIcon } from "@phosphor-icons/react";
import type { VariantProps } from "class-variance-authority";
import type { ComponentType } from "react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

interface RightSidebarProps {
	children: React.ReactNode;
	className?: string;
}

export function RightSidebar({ children, className }: RightSidebarProps) {
	return (
		<aside
			className={cn(
				"flex w-full shrink-0 flex-col border-t bg-card lg:h-full lg:w-auto lg:overflow-y-auto lg:border-t-0 lg:border-l",
				className
			)}
		>
			{children}
		</aside>
	);
}

interface SectionProps {
	badge?: {
		label: string;
		variant?: VariantProps<typeof badgeVariants>["variant"];
	};
	border?: boolean;
	children: React.ReactNode;
	className?: string;
	title?: string;
}

function Section({
	children,
	className,
	title,
	border = false,
	badge,
}: SectionProps) {
	return (
		<div className={cn(border && "border-b", "p-5", className)}>
			{title && (
				<div className="mb-3 flex items-center gap-2">
					<h3 className="font-semibold">{title}</h3>
					{badge && (
						<Badge variant={badge.variant || "gray"}>{badge.label}</Badge>
					)}
				</div>
			)}
			{children}
		</div>
	);
}

interface InfoCardProps {
	badge?: {
		label: string;
		variant?: VariantProps<typeof badgeVariants>["variant"];
	};
	className?: string;
	description?: string;
	icon: ComponentType<IconProps>;
	title: string;
}

function InfoCard({
	icon: IconComponent,
	title,
	description,
	className,
	badge,
}: InfoCardProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded border bg-background p-4",
				className
			)}
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded bg-secondary">
				<IconComponent
					className="text-accent-foreground"
					size={20}
					weight="duotone"
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate font-semibold">{title}</p>
					{badge && (
						<Badge variant={badge.variant || "gray"}>{badge.label}</Badge>
					)}
				</div>
				{description && (
					<p className="truncate text-muted-foreground text-sm">
						{description}
					</p>
				)}
			</div>
		</div>
	);
}

interface DocsLinkProps {
	className?: string;
	href?: string;
	label?: string;
}

function DocsLink({
	href = "https://www.databuddy.cc/docs/getting-started",
	label = "Documentation",
	className,
}: DocsLinkProps) {
	return (
		<Button
			asChild
			className={cn("w-full justify-start", className)}
			variant="outline"
		>
			<a href={href} rel="noopener noreferrer" target="_blank">
				<BookOpenIcon size={16} />
				{label}
			</a>
		</Button>
	);
}

interface SidebarTipProps {
	description: string;
	title?: string;
}

function SidebarTip({ description, title }: SidebarTipProps) {
	return <Tip description={description} title={title} />;
}

function SidebarSkeleton({ className }: { className?: string }) {
	return (
		<aside
			className={cn(
				"flex w-full shrink-0 flex-col gap-4 border-t border-l bg-card p-5 lg:h-full lg:w-auto lg:overflow-y-auto lg:border-t-0 lg:border-l",
				className
			)}
		>
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-18 w-full rounded" />
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-20 w-full rounded" />
		</aside>
	);
}

RightSidebar.Section = Section;
RightSidebar.InfoCard = InfoCard;
RightSidebar.DocsLink = DocsLink;
RightSidebar.Tip = SidebarTip;
RightSidebar.Skeleton = SidebarSkeleton;
