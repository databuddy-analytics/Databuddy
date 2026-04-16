"use client";

import { ChartBarIcon } from "@phosphor-icons/react";
import { ListIcon } from "@phosphor-icons/react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { UserIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Tabs,
	TabsBadge,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const BUTTON_VARIANTS = [
	"default",
	"destructive",
	"outline",
	"secondary",
	"ghost",
] as const;

const BUTTON_SIZES = ["default", "sm", "lg", "icon"] as const;

const BADGE_VARIANTS = [
	"default",
	"gray",
	"blue",
	"green",
	"amber",
	"secondary",
	"destructive",
	"outline",
] as const;

function ShowcaseSection({
	title,
	description,
	children,
	className,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("space-y-3", className)}>
			<div>
				<h2 className="text-balance font-semibold text-lg">{title}</h2>
				{description ? (
					<p className="mt-1 text-pretty text-muted-foreground text-sm">
						{description}
					</p>
				) : null}
			</div>
			<div className="rounded border border-border bg-card p-6 shadow-sm">
				{children}
			</div>
		</section>
	);
}

export function DesignShowcase() {
	const [segment, setSegment] = useState<"a" | "b" | "c">("a");
	const [switchOn, setSwitchOn] = useState(true);

	return (
		<div className="mx-auto w-full max-w-5xl space-y-12 overflow-auto px-4 py-8 md:px-6 md:py-10">
			<header className="space-y-2">
				<h1 className="text-balance font-bold text-2xl tracking-tight md:text-3xl">
					Design showcase
				</h1>
				<p className="max-w-2xl text-pretty text-muted-foreground text-sm">
					Placeholder labels and sample copy are for layout only. Extend this
					page as new primitives and variants land—see{" "}
					<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
						.cursor/rules/design-system.mdc
					</code>
					.
				</p>
			</header>

			<ShowcaseSection
				description="Variants × sizes. Icon size uses an icon-only affordance."
				title="Button"
			>
				<div className="flex flex-col gap-6">
					{BUTTON_VARIANTS.map((variant) => (
						<div className="flex flex-wrap items-center gap-2" key={variant}>
							<span className="w-28 shrink-0 font-mono text-muted-foreground text-xs">
								{variant}
							</span>
							{BUTTON_SIZES.map((size) => (
								<Button
									key={size}
									size={size === "icon" ? "icon" : size}
									type="button"
									variant={variant}
								>
									{size === "icon" ? (
										<PlusIcon className="size-4" weight="duotone" />
									) : (
										`${size}`
									)}
								</Button>
							))}
						</div>
					))}
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Semantic color tokens for status and labels."
				title="Badge"
			>
				<div className="flex flex-wrap gap-2">
					{BADGE_VARIANTS.map((variant) => (
						<Badge key={variant} variant={variant}>
							{variant}
						</Badge>
					))}
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Text fields and multiline. Prefix/suffix slots for icons."
				title="Input & textarea"
			>
				<div className="grid max-w-md gap-4">
					<div className="space-y-2">
						<Label htmlFor="design-input-default">Default</Label>
						<Input
							id="design-input-default"
							placeholder="Placeholder text"
							type="text"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="design-input-ghost">Ghost</Label>
						<Input
							id="design-input-ghost"
							placeholder="Ghost variant"
							variant="ghost"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="design-input-affix">With prefix</Label>
						<Input
							id="design-input-affix"
							placeholder="Search…"
							prefix={
								<MagnifyingGlassIcon className="size-4" weight="duotone" />
							}
							type="search"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="design-textarea">Textarea</Label>
						<Textarea
							id="design-textarea"
							minRows={3}
							placeholder="Longer placeholder copy for multiline fields."
						/>
					</div>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Surface, header, and body spacing."
				title="Card"
			>
				<Card className="max-w-md">
					<CardHeader>
						<CardTitle>Card title</CardTitle>
						<CardDescription>
							Optional description text for the card context.
						</CardDescription>
					</CardHeader>
					<CardContent className="text-pretty text-muted-foreground text-sm">
						Body content goes here. Use for grouped settings, summaries, or form
						sections.
					</CardContent>
				</Card>
			</ShowcaseSection>

			<ShowcaseSection
				description="Inline messages and validation tone."
				title="Alert"
			>
				<div className="grid max-w-lg gap-3">
					<Alert>
						<ChartBarIcon className="size-4" weight="duotone" />
						<AlertTitle>Default alert</AlertTitle>
						<AlertDescription>
							Supporting description with neutral emphasis.
						</AlertDescription>
					</Alert>
					<Alert variant="destructive">
						<ListIcon className="size-4" weight="duotone" />
						<AlertTitle>Destructive</AlertTitle>
						<AlertDescription>
							Use for errors or blocking issues the user must address.
						</AlertDescription>
					</Alert>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Loading placeholders for lists and cards."
				title="Skeleton"
			>
				<div className="flex max-w-md flex-col gap-3">
					<Skeleton className="h-10 w-full rounded" />
					<div className="flex gap-3">
						<Skeleton className="size-12 rounded" />
						<div className="flex flex-1 flex-col gap-2">
							<Skeleton className="h-4 w-3/4 rounded" />
							<Skeleton className="h-3 w-1/2 rounded" />
						</div>
					</div>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Binary and single-choice controls."
				title="Switch, checkbox, radio"
			>
				<div className="flex max-w-md flex-col gap-6">
					<div className="flex items-center gap-2">
						<Switch
							aria-label="Example switch"
							checked={switchOn}
							onCheckedChange={setSwitchOn}
						/>
						<Label className="font-normal">Switch label</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox defaultChecked id="design-cb" />
						<Label className="font-normal" htmlFor="design-cb">
							Checkbox label
						</Label>
					</div>
					<RadioGroup className="gap-2" defaultValue="one">
						<div className="flex items-center gap-2">
							<RadioGroupItem id="r1" value="one" />
							<Label className="font-normal" htmlFor="r1">
								Option one
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<RadioGroupItem id="r2" value="two" />
							<Label className="font-normal" htmlFor="r2">
								Option two
							</Label>
						</div>
					</RadioGroup>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Default, underline, and pills tab styles."
				title="Tabs"
			>
				<div className="space-y-8">
					<Tabs defaultValue="tab1">
						<TabsList>
							<TabsTrigger value="tab1">
								First
								<TabsBadge forValue="tab1">3</TabsBadge>
							</TabsTrigger>
							<TabsTrigger value="tab2">Second</TabsTrigger>
						</TabsList>
						<TabsContent className="text-muted-foreground text-sm" value="tab1">
							Panel one content.
						</TabsContent>
						<TabsContent className="text-muted-foreground text-sm" value="tab2">
							Panel two content.
						</TabsContent>
					</Tabs>

					<Tabs defaultValue="u1" variant="underline">
						<TabsList className="w-full">
							<TabsTrigger className="flex-1" value="u1">
								Overview
							</TabsTrigger>
							<TabsTrigger className="flex-1" value="u2">
								Details
							</TabsTrigger>
						</TabsList>
						<TabsContent className="text-muted-foreground text-sm" value="u1">
							Underline variant — panel A.
						</TabsContent>
						<TabsContent className="text-muted-foreground text-sm" value="u2">
							Underline variant — panel B.
						</TabsContent>
					</Tabs>

					<Tabs defaultValue="p1" variant="pills">
						<TabsList>
							<TabsTrigger value="p1">Day</TabsTrigger>
							<TabsTrigger value="p2">Week</TabsTrigger>
						</TabsList>
						<TabsContent className="text-muted-foreground text-sm" value="p1">
							Pills — day range.
						</TabsContent>
						<TabsContent className="text-muted-foreground text-sm" value="p2">
							Pills — week range.
						</TabsContent>
					</Tabs>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Horizontal rule between blocks."
				title="Separator"
			>
				<div className="space-y-2 text-sm">
					<p className="text-muted-foreground">Block above</p>
					<Separator />
					<p className="text-muted-foreground">Block below</p>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Determinate progress (0–100)."
				title="Progress"
			>
				<div className="max-w-md space-y-4">
					<Progress value={40} />
					<Progress value={66} />
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Image, initials fallback, and sizes."
				title="Avatar"
			>
				<div className="flex flex-wrap items-center gap-4">
					<Avatar className="size-10">
						<AvatarFallback className="bg-muted text-xs">AB</AvatarFallback>
					</Avatar>
					<Avatar className="size-10">
						<AvatarFallback className="bg-primary text-primary-foreground">
							<UserIcon className="size-5" weight="duotone" />
						</AvatarFallback>
					</Avatar>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Trigger + menu surface; icon trigger has an aria-label."
				title="Dropdown menu"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button aria-label="Open menu" type="button" variant="outline">
							Open menu
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-56">
						<DropdownMenuLabel>Section</DropdownMenuLabel>
						<DropdownMenuItem>Item one</DropdownMenuItem>
						<DropdownMenuItem>Item two</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive">
							Destructive
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</ShowcaseSection>

			<ShowcaseSection
				description="Single-select list in a popover."
				title="Select"
			>
				<Select defaultValue="b">
					<SelectTrigger className="w-[220px]">
						<SelectValue placeholder="Choose…" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="a">Option A</SelectItem>
						<SelectItem value="b">Option B</SelectItem>
						<SelectItem value="c">Option C</SelectItem>
					</SelectContent>
				</Select>
			</ShowcaseSection>

			<ShowcaseSection
				description="Hover or focus the control to reveal."
				title="Tooltip"
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button type="button" variant="outline">
							Hover me
						</Button>
					</TooltipTrigger>
					<TooltipContent className="max-w-xs text-balance" side="bottom">
						Tooltip body copy for supplementary context.
					</TooltipContent>
				</Tooltip>
			</ShowcaseSection>

			<ShowcaseSection
				description="Destructive confirmation pattern."
				title="Alert dialog"
			>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button type="button" variant="destructive">
							Open alert dialog
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Confirm action</AlertDialogTitle>
							<AlertDialogDescription>
								Placeholder description. This is a destructive or irreversible
								flow.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel type="button">Cancel</AlertDialogCancel>
							<AlertDialogAction type="button">Continue</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</ShowcaseSection>

			<ShowcaseSection
				description="Two or three options in a compact control."
				title="Segmented control"
			>
				<SegmentedControl
					onValueChangeAction={(v) => setSegment(v)}
					options={[
						{ value: "a", label: "Alpha" },
						{ value: "b", label: "Beta" },
						{ value: "c", label: "Gamma" },
					]}
					value={segment}
				/>
			</ShowcaseSection>

			<ShowcaseSection
				description="Percent deltas with tiered emphasis."
				title="Percentage badge"
			>
				<div className="flex flex-wrap gap-2">
					<PercentageBadge percentage={62} />
					<PercentageBadge percentage={28} />
					<PercentageBadge percentage={12} />
					<PercentageBadge percentage={4} />
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Pressable toggle with on/off visual state."
				title="Toggle"
			>
				<div className="flex flex-wrap gap-2">
					<Toggle aria-label="Toggle bold" type="button">
						<ChartBarIcon className="size-4" weight="duotone" />
					</Toggle>
					<Toggle type="button" variant="outline">
						Outlined
					</Toggle>
				</div>
			</ShowcaseSection>
		</div>
	);
}
