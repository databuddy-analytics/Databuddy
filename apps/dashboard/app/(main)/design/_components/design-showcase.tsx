"use client";

import { Accordion } from "@/components/ds/accordion";
import { Avatar } from "@/components/ds/avatar";
import { Badge, PercentageBadge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";
import { Calendar } from "@/components/ds/calendar";
import { Card } from "@/components/ds/card";
import { Checkbox } from "@/components/ds/checkbox";
import { CopyButton } from "@/components/ds/copy-button";
import { DeleteDialog } from "@/components/ds/delete-dialog";
import { Dialog } from "@/components/ds/dialog";
import { Divider } from "@/components/ds/divider";
import { DropdownMenu } from "@/components/ds/dropdown-menu";
import { EmptyState } from "@/components/ds/empty-state";
import { Field } from "@/components/ds/field";
import { Input } from "@/components/ds/input";
import { Popover } from "@/components/ds/popover";
import { Progress } from "@/components/ds/progress";
import { SegmentedControl } from "@/components/ds/segmented-control";
import { Select } from "@/components/ds/select";
import { Sheet } from "@/components/ds/sheet";
import { Skeleton } from "@/components/ds/skeleton";
import { Spinner } from "@/components/ds/spinner";
import { StatusDot } from "@/components/ds/status-dot";
import { Switch } from "@/components/ds/switch";
import { Tabs } from "@/components/ds/tabs";
import { Text } from "@/components/ds/text";
import { Textarea } from "@/components/ds/textarea";
import { Tooltip } from "@/components/ds/tooltip";
import {
	ArrowRight,
	ArrowUp,
	Bell,
	CaretRight,
	Check,
	CheckCircle,
	Clock,
	CreditCard,
	DotsThree,
	EnvelopeSimple,
	Gear,
	Globe,
	Key,
	Lightning,
	Lock,
	MagnifyingGlass,
	Moon,
	Palette,
	PaperPlaneTilt,
	Plus,
	Rocket,
	ShieldCheck,
	Sun,
	Trash,
	TrendUp,
	User,
	UsersThree,
	Warning,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { ShowcaseRow, ShowcaseSection } from "./showcase-section";

const BUTTON_VARIANTS = ["primary", "secondary", "ghost"] as const;
const BUTTON_TONES = ["neutral", "danger"] as const;
const BUTTON_SIZES = ["sm", "md", "lg"] as const;

const BADGE_VARIANTS = [
	"default",
	"primary",
	"success",
	"warning",
	"destructive",
	"muted",
] as const;

const TEXT_VARIANTS = [
	"display",
	"title",
	"heading",
	"body",
	"label",
	"caption",
] as const;

export function DesignShowcase() {
	const [sheetOpen, setSheetOpen] = useState(false);
	const [segmentedValue, setSegmentedValue] = useState("weekly");
	const [segmentedPill, setSegmentedPill] = useState("area");
	const [calendarDate, setCalendarDate] = useState<Date | undefined>(
		new Date()
	);
	const [calendarRange, setCalendarRange] = useState<{
		from: Date;
		to?: Date;
	}>({ from: new Date(), to: new Date(Date.now() + 6 * 86_400_000) });
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteChildrenOpen, setDeleteChildrenOpen] = useState(false);

	return (
		<div className="mx-auto w-full max-w-5xl space-y-0 overflow-auto px-4 py-8 md:px-6 md:py-10">
			<header className="flex flex-col gap-1 pb-12">
				<Text variant="display">Design system</Text>
				<Text className="max-w-2xl text-pretty" tone="muted" variant="body">
					Every primitive in{" "}
					<Text
						as="code"
						className="rounded bg-secondary px-1.5 py-0.5"
						mono
						variant="caption"
					>
						components/ds/
					</Text>{" "}
					— built on Base UI, styled with Tailwind, iconography from Phosphor.
				</Text>
			</header>

			<ShowcaseSection
				description="Polymorphic component — renders the semantic element for each variant automatically. Supports tone, mono, and custom `as` overrides."
				id="text"
				title="Text"
			>
				<ShowcaseRow label="Scale">
					<div className="flex w-full flex-col gap-3">
						{TEXT_VARIANTS.map((v) => (
							<div className="flex items-baseline gap-4" key={v}>
								<Text
									className="w-14 shrink-0 text-right"
									mono
									tone="muted"
									variant="caption"
								>
									{v}
								</Text>
								<Text variant={v}>The quick brown fox jumps</Text>
							</div>
						))}
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="Tones">
					<Text>Default</Text>
					<Divider className="h-4" orientation="vertical" />
					<Text tone="muted">Muted</Text>
					<Divider className="h-4" orientation="vertical" />
					<Text tone="destructive">Destructive</Text>
				</ShowcaseRow>
				<ShowcaseRow label="Mono">
					<Text mono>0xDEADBEEF</Text>
					<Text mono tone="muted" variant="caption">
						sha-a5a6f35
					</Text>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Three variants (primary, secondary, ghost) × two tones (neutral, danger) × three sizes."
				id="button"
				title="Button"
			>
				{BUTTON_TONES.map((tone) => (
					<ShowcaseRow key={tone} label={tone}>
						<div className="flex flex-col gap-3">
							{BUTTON_VARIANTS.map((variant) => (
								<div className="flex items-center gap-2" key={variant}>
									<Text
										className="w-20 shrink-0 text-right"
										mono
										tone="muted"
										variant="caption"
									>
										{variant}
									</Text>
									{BUTTON_SIZES.map((size) => (
										<Button
											key={size}
											size={size}
											tone={tone}
											variant={variant}
										>
											{size}
										</Button>
									))}
									<Button disabled size="md" tone={tone} variant={variant}>
										disabled
									</Button>
								</div>
							))}
						</div>
					</ShowcaseRow>
				))}
				<ShowcaseRow label="With icons">
					<Button>
						<Plus className="size-3.5" />
						Create
					</Button>
					<Button tone="danger">
						<Trash className="size-3.5" />
						Delete
					</Button>
					<Button variant="secondary">
						<Gear className="size-3.5" />
						Settings
					</Button>
					<Button variant="ghost">
						<User className="size-3.5" />
						Profile
					</Button>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Six semantic variants at two sizes. Pill-shaped, inline."
				id="badge"
				title="Badge"
			>
				<ShowcaseRow label="md">
					{BADGE_VARIANTS.map((v) => (
						<Badge key={v} variant={v}>
							{v}
						</Badge>
					))}
				</ShowcaseRow>
				<ShowcaseRow label="sm">
					{BADGE_VARIANTS.map((v) => (
						<Badge key={v} size="sm" variant={v}>
							{v}
						</Badge>
					))}
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Composed surface — Card.Header (muted bg), Card.Content, Card.Footer (angled-rectangle-gradient). All slots optional."
				id="card"
				title="Card"
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Card>
						<Card.Header>
							<Card.Title>Full card</Card.Title>
							<Card.Description>Header, content, and footer.</Card.Description>
						</Card.Header>
						<Card.Content>
							<Text tone="muted">Content area — forms, lists, anything.</Text>
						</Card.Content>
						<Card.Footer>
							<Button size="sm" variant="secondary">
								Cancel
							</Button>
							<Button size="sm">Save</Button>
						</Card.Footer>
					</Card>
					<Card>
						<Card.Header>
							<Card.Title>Header only</Card.Title>
							<Card.Description>
								No content or footer slots used.
							</Card.Description>
						</Card.Header>
					</Card>
					<Card>
						<Card.Content className="flex items-center gap-3">
							<Avatar alt="Iza" size="md" />
							<div className="flex min-w-0 flex-1 flex-col">
								<Text variant="label">Iza</Text>
								<Text tone="muted" variant="caption">
									iza@databuddy.cc
								</Text>
							</div>
							<Badge size="sm" variant="primary">
								Owner
							</Badge>
						</Card.Content>
					</Card>
					<Card>
						<Card.Content className="flex flex-col items-center gap-2 py-8">
							<Spinner size="md" />
							<Text tone="muted" variant="caption">
								Loading…
							</Text>
						</Card.Content>
					</Card>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Field wires label, description, error, and aria attributes to its child input via context. No manual id plumbing needed."
				id="field"
				title="Field & Input"
			>
				<div className="grid gap-6 sm:grid-cols-2">
					<Field>
						<Field.Label>Default</Field.Label>
						<Input placeholder="Placeholder text" />
						<Field.Description>Helper text below the input.</Field.Description>
					</Field>
					<Field>
						<Field.Label>With prefix</Field.Label>
						<Input
							placeholder="Search…"
							prefix={<MagnifyingGlass className="size-3.5" />}
						/>
					</Field>
					<Field>
						<Field.Label>With suffix</Field.Label>
						<Input
							defaultValue="sk_live_..."
							suffix={<Key className="size-3.5" />}
						/>
					</Field>
					<Field error>
						<Field.Label>Error state</Field.Label>
						<Input defaultValue="bad-value" />
						<Field.Error>Domain is already taken.</Field.Error>
					</Field>
					<Field>
						<Field.Label>Disabled</Field.Label>
						<Input defaultValue="read-only" disabled />
					</Field>
					<Field>
						<Field.Label>Prefix + suffix</Field.Label>
						<Input placeholder="amount" prefix="$" suffix="USD" />
					</Field>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Plain textarea wired to Field context. Supports all standard textarea attributes."
				id="textarea"
				title="Textarea"
			>
				<div className="grid gap-6 sm:grid-cols-2">
					<Field>
						<Field.Label>Default</Field.Label>
						<Textarea placeholder="Write something…" />
					</Field>
					<Field error>
						<Field.Label>With error</Field.Label>
						<Textarea defaultValue="Too short" />
						<Field.Error>Minimum 20 characters.</Field.Error>
					</Field>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Single-select dropdown with built-in label registry — Select.Value automatically displays the selected item's text label."
				id="select"
				title="Select"
			>
				<div className="grid gap-6 sm:grid-cols-2">
					<Field>
						<Field.Label>Plan</Field.Label>
						<Select defaultValue="pro">
							<Select.Trigger />
							<Select.Content>
								<Select.Item value="free">Free</Select.Item>
								<Select.Item value="pro">Pro</Select.Item>
								<Select.Item value="enterprise">Enterprise</Select.Item>
							</Select.Content>
						</Select>
					</Field>
					<Field>
						<Field.Label>With groups</Field.Label>
						<Select defaultValue="7d">
							<Select.Trigger />
							<Select.Content>
								<Select.Group>
									<Select.GroupLabel>Quick</Select.GroupLabel>
									<Select.Item value="24h">Last 24 hours</Select.Item>
									<Select.Item value="7d">Last 7 days</Select.Item>
									<Select.Item value="30d">Last 30 days</Select.Item>
								</Select.Group>
								<Select.Group>
									<Select.GroupLabel>Calendar</Select.GroupLabel>
									<Select.Item value="mtd">Month to date</Select.Item>
									<Select.Item value="ytd">Year to date</Select.Item>
								</Select.Group>
							</Select.Content>
						</Select>
					</Field>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Both support standalone use or composed with label + description. Wired to Field context when nested."
				id="controls"
				title="Switch & Checkbox"
			>
				<ShowcaseRow label="Switch">
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-6">
							<Switch />
							<Switch defaultChecked />
							<Switch disabled />
							<Switch defaultChecked disabled />
						</div>
						<Divider />
						<Switch
							defaultChecked
							description="Receive alerts when anomalies are detected."
							label="Email notifications"
						/>
						<Switch
							description="A summary of your analytics every Monday."
							label="Weekly digest"
						/>
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="Checkbox">
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-6">
							<Checkbox />
							<Checkbox defaultChecked />
							<Checkbox disabled />
							<Checkbox defaultChecked disabled />
						</div>
						<Divider />
						<Checkbox
							defaultChecked
							description="You must accept before continuing."
							label="I agree to the terms"
						/>
						<Checkbox label="Subscribe to changelog" />
					</div>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Collapsible sections built on Base UI Collapsible. Accordion.Trigger for the header, Accordion.Content for bordered content."
				id="accordion"
				title="Accordion"
			>
				<div className="space-y-2">
					<div className="overflow-hidden rounded-md border">
						<Accordion defaultOpen>
							<Accordion.Trigger>
								<Text variant="label">Permissions</Text>
								<Badge className="ml-auto" size="sm" variant="muted">
									3 selected
								</Badge>
							</Accordion.Trigger>
							<Accordion.Content>
								<div className="space-y-2">
									<Checkbox defaultChecked label="Read data" />
									<Checkbox defaultChecked label="Write data" />
									<Checkbox defaultChecked label="Admin" />
								</div>
							</Accordion.Content>
						</Accordion>
					</div>
					<div className="overflow-hidden rounded-md border">
						<Accordion>
							<Accordion.Trigger>
								<Text variant="label">Advanced settings</Text>
							</Accordion.Trigger>
							<Accordion.Content>
								<Text tone="muted" variant="caption">
									Configure rate limits, IP allowlists, and other advanced
									options.
								</Text>
							</Accordion.Content>
						</Accordion>
					</div>
					<div className="overflow-hidden rounded-md border">
						<Accordion>
							<Accordion.Trigger>
								<Text variant="label">Webhook destination</Text>
								<Badge className="ml-auto" size="sm" variant="success">
									Active
								</Badge>
							</Accordion.Trigger>
							<Accordion.Content>
								<Field>
									<Field.Label>Endpoint URL</Field.Label>
									<Input placeholder="https://api.example.com/webhooks/..." />
								</Field>
							</Accordion.Content>
						</Accordion>
					</div>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Pill-style tabs with animated indicator. Tabs.Tab, Tabs.Panel, Tabs.List."
				id="tabs"
				title="Tabs"
			>
				<Tabs defaultValue="overview">
					<Tabs.List>
						<Tabs.Tab value="overview">Overview</Tabs.Tab>
						<Tabs.Tab value="analytics">Analytics</Tabs.Tab>
						<Tabs.Tab value="settings">Settings</Tabs.Tab>
						<Tabs.Tab disabled value="disabled">
							Disabled
						</Tabs.Tab>
					</Tabs.List>
					<Tabs.Panel className="pt-4" value="overview">
						<Card>
							<Card.Content>
								<Text tone="muted">
									Overview panel — tab content can be anything.
								</Text>
							</Card.Content>
						</Card>
					</Tabs.Panel>
					<Tabs.Panel className="pt-4" value="analytics">
						<Card>
							<Card.Content>
								<Text tone="muted">Analytics panel.</Text>
							</Card.Content>
						</Card>
					</Tabs.Panel>
					<Tabs.Panel className="pt-4" value="settings">
						<Card>
							<Card.Content>
								<Text tone="muted">Settings panel.</Text>
							</Card.Content>
						</Card>
					</Tabs.Panel>
				</Tabs>
			</ShowcaseSection>

			<ShowcaseSection
				description="Three sizes. Falls back to initials derived from `alt` or an explicit `fallback` string."
				id="avatar"
				title="Avatar"
			>
				<ShowcaseRow label="Sizes">
					<Avatar alt="Small" size="sm" />
					<Avatar alt="Medium" size="md" />
					<Avatar alt="Large User" size="lg" />
				</ShowcaseRow>
				<ShowcaseRow label="Fallbacks">
					<Avatar fallback="DB" size="md" />
					<Avatar fallback="?" size="md" />
					<Avatar alt="Jane Doe" size="md" />
					<Avatar
						alt="Broken"
						size="md"
						src="https://bad-url.invalid/nope.png"
					/>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Hover or focus the trigger to reveal. Clones the child ref — works on any focusable element."
				id="tooltip"
				title="Tooltip"
			>
				<ShowcaseRow>
					<Tooltip content="I appear on top" side="top">
						<Button variant="secondary">Top</Button>
					</Tooltip>
					<Tooltip content="I appear below" side="bottom">
						<Button variant="secondary">Bottom</Button>
					</Tooltip>
					<Tooltip content="I appear to the left" side="left">
						<Button variant="secondary">Left</Button>
					</Tooltip>
					<Tooltip content="I appear to the right" side="right">
						<Button variant="secondary">Right</Button>
					</Tooltip>
					<Tooltip content="Works on any element">
						<Badge variant="success">Hover me</Badge>
					</Tooltip>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Modal with Header (muted bg), Body, Footer (angled-rectangle-gradient). Close button auto-positioned top-right, or wrap any child with Dialog.Close."
				id="dialog"
				title="Dialog"
			>
				<ShowcaseRow>
					<Dialog>
						<Dialog.Trigger
							render={<Button variant="secondary">Default dialog</Button>}
						/>
						<Dialog.Content>
							<Dialog.Close />
							<Dialog.Header>
								<Dialog.Title>Edit website</Dialog.Title>
								<Dialog.Description>
									Change the name and domain for this property.
								</Dialog.Description>
							</Dialog.Header>
							<Dialog.Body className="flex flex-col gap-4">
								<Field>
									<Field.Label>Name</Field.Label>
									<Input defaultValue="My Website" />
								</Field>
								<Field>
									<Field.Label>Domain</Field.Label>
									<Input defaultValue="example.com" />
								</Field>
							</Dialog.Body>
							<Dialog.Footer>
								<Dialog.Close>
									<Button variant="secondary">Cancel</Button>
								</Dialog.Close>
								<Button>Save</Button>
							</Dialog.Footer>
						</Dialog.Content>
					</Dialog>
					<Dialog>
						<Dialog.Trigger
							render={
								<Button tone="danger" variant="secondary">
									Destructive dialog
								</Button>
							}
						/>
						<Dialog.Content>
							<Dialog.Close />
							<Dialog.Header>
								<Dialog.Title>Delete website</Dialog.Title>
								<Dialog.Description>
									This will permanently remove all analytics data. This action
									cannot be undone.
								</Dialog.Description>
							</Dialog.Header>
							<Dialog.Footer>
								<Dialog.Close>
									<Button variant="secondary">Cancel</Button>
								</Dialog.Close>
								<Button tone="danger">Delete forever</Button>
							</Dialog.Footer>
						</Dialog.Content>
					</Dialog>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Slide-out panel — same sub-component API as Dialog. Supports `side` prop for left or right."
				id="sheet"
				title="Sheet"
			>
				<ShowcaseRow>
					<Sheet onOpenChange={setSheetOpen} open={sheetOpen}>
						<Sheet.Trigger
							render={<Button variant="secondary">Open sheet</Button>}
						/>
						<Sheet.Content>
							<Sheet.Close />
							<Sheet.Header>
								<Sheet.Title>Website details</Sheet.Title>
								<Sheet.Description>
									View and edit this property.
								</Sheet.Description>
							</Sheet.Header>
							<Sheet.Body className="flex flex-col gap-4">
								<Field>
									<Field.Label>Name</Field.Label>
									<Input defaultValue="databuddy.cc" />
								</Field>
								<Field>
									<Field.Label>Notes</Field.Label>
									<Textarea placeholder="Internal notes…" />
								</Field>
							</Sheet.Body>
							<Sheet.Footer>
								<Button onClick={() => setSheetOpen(false)} variant="secondary">
									Cancel
								</Button>
								<Button>Save</Button>
							</Sheet.Footer>
						</Sheet.Content>
					</Sheet>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Floating menu with items, groups, separators, and a destructive variant."
				id="dropdown"
				title="Dropdown menu"
			>
				<ShowcaseRow>
					<DropdownMenu>
						<DropdownMenu.Trigger
							render={<Button variant="secondary">Actions</Button>}
						/>
						<DropdownMenu.Content align="start">
							<DropdownMenu.Group>
								<DropdownMenu.GroupLabel>Navigate</DropdownMenu.GroupLabel>
								<DropdownMenu.Item>
									<Gear className="size-3.5" />
									Settings
								</DropdownMenu.Item>
								<DropdownMenu.Item>
									<User className="size-3.5" />
									Profile
								</DropdownMenu.Item>
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive">
								<Trash className="size-3.5" />
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu>
					<DropdownMenu>
						<DropdownMenu.Trigger
							render={
								<Button size="sm" variant="ghost">
									<Gear className="size-3.5" />
									Icon trigger
								</Button>
							}
						/>
						<DropdownMenu.Content>
							<DropdownMenu.Item>Option A</DropdownMenu.Item>
							<DropdownMenu.Item>Option B</DropdownMenu.Item>
							<DropdownMenu.Item>Option C</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Anchored floating panel with title and description."
				id="popover"
				title="Popover"
			>
				<ShowcaseRow>
					<Popover>
						<Popover.Trigger
							render={<Button variant="secondary">Open popover</Button>}
						/>
						<Popover.Content>
							<Popover.Title>Invite teammate</Popover.Title>
							<Popover.Description className="mt-1">
								Enter their email to send an invite.
							</Popover.Description>
							<div className="mt-3 flex flex-col gap-2">
								<Input placeholder="name@company.com" />
								<Button size="sm">Send invite</Button>
							</div>
						</Popover.Content>
					</Popover>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Horizontal or vertical rule. Defaults to horizontal."
				id="divider"
				title="Divider"
			>
				<ShowcaseRow label="Horizontal">
					<div className="w-full space-y-2">
						<Text tone="muted" variant="caption">
							Section A
						</Text>
						<Divider />
						<Text tone="muted" variant="caption">
							Section B
						</Text>
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="Vertical">
					<div className="flex h-8 items-center gap-3">
						<Text tone="muted" variant="caption">
							Left
						</Text>
						<Divider orientation="vertical" />
						<Text tone="muted" variant="caption">
							Right
						</Text>
					</div>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Animated pulse placeholder for loading states. Shape it with className."
				id="skeleton"
				title="Skeleton"
			>
				<ShowcaseRow label="Card skeleton">
					<div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border/60 p-5">
						<div className="flex items-center gap-3">
							<Skeleton className="size-10 rounded-full" />
							<div className="flex flex-1 flex-col gap-2">
								<Skeleton className="h-3.5 w-28" />
								<Skeleton className="h-3 w-40" />
							</div>
						</div>
						<Skeleton className="h-20 w-full" />
						<div className="flex gap-2">
							<Skeleton className="h-8 w-20" />
							<Skeleton className="h-8 w-20" />
						</div>
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="Table skeleton">
					<div className="flex w-full max-w-sm flex-col gap-3">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-3/4" />
					</div>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Loading spinner with spin animation. Three sizes."
				id="spinner"
				title="Spinner"
			>
				<ShowcaseRow label="Sizes">
					<div className="flex items-center gap-6">
						<div className="flex flex-col items-center gap-2">
							<Spinner size="sm" />
							<Text mono tone="muted" variant="caption">
								sm
							</Text>
						</div>
						<div className="flex flex-col items-center gap-2">
							<Spinner size="md" />
							<Text mono tone="muted" variant="caption">
								md
							</Text>
						</div>
						<div className="flex flex-col items-center gap-2">
							<Spinner size="lg" />
							<Text mono tone="muted" variant="caption">
								lg
							</Text>
						</div>
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="In context">
					<Button disabled>
						<Spinner size="sm" />
						Saving…
					</Button>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Centered placeholder with optional icon, title, description, and action slot."
				id="empty-state"
				title="Empty state"
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="rounded-lg border border-border/60 border-dashed py-16">
						<EmptyState
							action={
								<Button size="sm">
									<Plus className="size-3.5" />
									Add website
								</Button>
							}
							description="Get started by adding your first website to track."
							icon={<TrendUp />}
							title="No websites yet"
						/>
					</div>
					<div className="rounded-lg border border-border/60 border-dashed py-16">
						<EmptyState
							description="Try adjusting your filters or date range."
							title="No data"
						/>
					</div>
				</div>
			</ShowcaseSection>

			<ShowcaseSection
				description="Semantic dot indicator — four colors, four sizes, optional pulse animation."
				id="status-dot"
				title="StatusDot"
			>
				<ShowcaseRow label="Colors">
					<div className="flex items-center gap-1.5">
						<StatusDot color="success" />
						<Text variant="caption">success</Text>
					</div>
					<div className="flex items-center gap-1.5">
						<StatusDot color="warning" />
						<Text variant="caption">warning</Text>
					</div>
					<div className="flex items-center gap-1.5">
						<StatusDot color="danger" />
						<Text variant="caption">danger</Text>
					</div>
					<div className="flex items-center gap-1.5">
						<StatusDot color="muted" />
						<Text variant="caption">muted</Text>
					</div>
					<div className="flex items-center gap-1.5">
						<StatusDot color="info" />
						<Text variant="caption">info</Text>
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="Sizes">
					<div className="flex items-center gap-4">
						{(["xs", "sm", "md", "lg"] as const).map((s) => (
							<div className="flex flex-col items-center gap-2" key={s}>
								<StatusDot color="success" size={s} />
								<Text mono tone="muted" variant="caption">
									{s}
								</Text>
							</div>
						))}
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="Pulse">
					<div className="flex items-center gap-1.5">
						<StatusDot color="success" pulse />
						<Text variant="caption">3 users online</Text>
					</div>
					<div className="flex items-center gap-1.5">
						<StatusDot color="danger" pulse />
						<Text variant="caption">Incident active</Text>
					</div>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Badge that auto-colors by percentage threshold — green ≥50%, blue ≥25%, amber ≥10%, muted below."
				id="percentage-badge"
				title="PercentageBadge"
			>
				<ShowcaseRow label="Thresholds">
					<PercentageBadge percentage={87.3} />
					<PercentageBadge percentage={42.1} />
					<PercentageBadge percentage={18.6} />
					<PercentageBadge percentage={5.2} />
					<PercentageBadge percentage={0} />
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Determinate progress bar with semantic tones and two sizes."
				id="progress"
				title="Progress"
			>
				<ShowcaseRow label="Tones">
					<div className="flex w-full flex-col gap-3">
						<div className="flex items-center gap-3">
							<Text
								className="w-16 shrink-0 text-right"
								mono
								tone="muted"
								variant="caption"
							>
								primary
							</Text>
							<Progress className="flex-1" tone="primary" value={62} />
						</div>
						<div className="flex items-center gap-3">
							<Text
								className="w-16 shrink-0 text-right"
								mono
								tone="muted"
								variant="caption"
							>
								success
							</Text>
							<Progress className="flex-1" tone="success" value={84} />
						</div>
						<div className="flex items-center gap-3">
							<Text
								className="w-16 shrink-0 text-right"
								mono
								tone="muted"
								variant="caption"
							>
								warning
							</Text>
							<Progress className="flex-1" tone="warning" value={45} />
						</div>
						<div className="flex items-center gap-3">
							<Text
								className="w-16 shrink-0 text-right"
								mono
								tone="muted"
								variant="caption"
							>
								danger
							</Text>
							<Progress className="flex-1" tone="danger" value={91} />
						</div>
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="Sizes">
					<div className="flex w-full flex-col gap-3">
						<div className="flex items-center gap-3">
							<Text
								className="w-8 shrink-0 text-right"
								mono
								tone="muted"
								variant="caption"
							>
								sm
							</Text>
							<Progress className="flex-1" size="sm" value={55} />
						</div>
						<div className="flex items-center gap-3">
							<Text
								className="w-8 shrink-0 text-right"
								mono
								tone="muted"
								variant="caption"
							>
								md
							</Text>
							<Progress className="flex-1" size="md" value={55} />
						</div>
					</div>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Mutually exclusive option group — default (card indicator) and pill (primary bg) variants at two sizes."
				id="segmented-control"
				title="SegmentedControl"
			>
				<ShowcaseRow label="Default">
					<SegmentedControl
						onChange={setSegmentedValue}
						options={[
							{ label: "Daily", value: "daily" },
							{ label: "Weekly", value: "weekly" },
							{ label: "Monthly", value: "monthly" },
						]}
						value={segmentedValue}
					/>
				</ShowcaseRow>
				<ShowcaseRow label="Pill">
					<SegmentedControl
						onChange={setSegmentedPill}
						options={[
							{ label: "Area", value: "area" },
							{ label: "Line", value: "line" },
							{ label: "Bar", value: "bar" },
						]}
						value={segmentedPill}
						variant="pill"
					/>
				</ShowcaseRow>
				<ShowcaseRow label="Small + disabled">
					<SegmentedControl
						onChange={setSegmentedValue}
						options={[
							{ label: "Light", value: "daily" },
							{ label: "Dark", value: "weekly" },
							{ label: "System", value: "monthly" },
						]}
						size="sm"
						value={segmentedValue}
					/>
					<SegmentedControl
						disabled
						onChange={() => {}}
						options={[
							{ label: "On", value: "on" },
							{ label: "Off", value: "off" },
						]}
						value="on"
					/>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Date picker built on react-day-picker — single date selection and date range modes."
				id="calendar"
				title="Calendar"
			>
				<ShowcaseRow label="Single date">
					<Calendar
						mode="single"
						onSelect={setCalendarDate}
						selected={calendarDate}
					/>
				</ShowcaseRow>
				<ShowcaseRow label="Date range">
					<Calendar
						mode="range"
						onSelect={(range) => {
							if (range?.from) {
								setCalendarRange({ from: range.from, to: range.to });
							}
						}}
						selected={calendarRange}
					/>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="One-click copy with built-in tooltip and check feedback. Icon-only or with label."
				id="copy-button"
				title="CopyButton"
			>
				<ShowcaseRow label="Icon-only">
					<div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2">
						<Text mono variant="caption">
							sk_live_abc123def456
						</Text>
						<CopyButton value="sk_live_abc123def456" />
					</div>
				</ShowcaseRow>
				<ShowcaseRow label="With label">
					<CopyButton
						label="Copy API key"
						value="sk_live_abc123def456"
						variant="secondary"
					/>
					<CopyButton
						label="Copy URL"
						size="lg"
						value="https://databuddy.cc"
						variant="secondary"
					/>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="Pre-composed destructive confirmation dialog with auto-close on completion."
				id="delete-dialog"
				title="DeleteDialog"
			>
				<ShowcaseRow>
					<Button
						onClick={() => setDeleteOpen(true)}
						tone="danger"
						variant="secondary"
					>
						<Trash className="size-3.5" />
						Delete item
					</Button>
					<DeleteDialog
						isOpen={deleteOpen}
						itemName="My Website"
						onClose={() => setDeleteOpen(false)}
						onConfirm={() => setDeleteOpen(false)}
						title="Delete website"
					/>
					<Button
						onClick={() => setDeleteChildrenOpen(true)}
						tone="danger"
						variant="secondary"
					>
						<Warning className="size-3.5" />
						With extra content
					</Button>
					<DeleteDialog
						description="Removing this API key will immediately revoke access for all services using it."
						isOpen={deleteChildrenOpen}
						onClose={() => setDeleteChildrenOpen(false)}
						onConfirm={() => setDeleteChildrenOpen(false)}
						title="Revoke API key"
					>
						<div className="flex items-center gap-3 rounded-md bg-secondary p-3">
							<div className="flex size-8 items-center justify-center rounded-md bg-muted">
								<Key className="size-3.5 text-muted-foreground" />
							</div>
							<div className="flex flex-col">
								<Text variant="caption">Production key</Text>
								<Text mono tone="muted" variant="caption">
									sk_live_...f456
								</Text>
							</div>
						</div>
					</DeleteDialog>
				</ShowcaseRow>
			</ShowcaseSection>

			<ShowcaseSection
				description="A composed settings page demonstrating how primitives combine into a real product surface."
				id="settings-mockup"
				title="Mockup — Settings"
			>
				<SettingsMockup />
			</ShowcaseSection>

			<ShowcaseSection
				description="Stat cards, sparkline placeholders, and a metric grid — the shape of a real analytics overview."
				id="analytics-mockup"
				title="Mockup — Analytics dashboard"
			>
				<AnalyticsMockup />
			</ShowcaseSection>

			<ShowcaseSection
				description="Member list with roles, invite dialog, and bulk actions."
				id="team-mockup"
				title="Mockup — Team members"
			>
				<TeamMockup />
			</ShowcaseSection>

			<ShowcaseSection
				description="Plan cards with feature comparison, usage meter, and payment form."
				id="billing-mockup"
				title="Mockup — Billing"
			>
				<BillingMockup />
			</ShowcaseSection>

			<ShowcaseSection
				description="Multi-step guided flow with progress indicator and conditional navigation."
				id="onboarding-mockup"
				title="Mockup — Onboarding"
			>
				<OnboardingMockup />
			</ShowcaseSection>
		</div>
	);
}

const NAV_ITEMS = [
	{ id: "general", label: "General", icon: User },
	{ id: "notifications", label: "Notifications", icon: Bell },
	{ id: "appearance", label: "Appearance", icon: Palette },
	{ id: "security", label: "Security", icon: ShieldCheck },
] as const;

type SettingsSection = (typeof NAV_ITEMS)[number]["id"];

function SettingsMockup() {
	const [active, setActive] = useState<SettingsSection>("general");
	const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

	return (
		<div className="flex overflow-hidden rounded-xl border border-border/60">
			<nav className="flex w-56 shrink-0 flex-col gap-1 border-border/60 border-r bg-muted/30 p-3">
				<div className="flex items-center gap-2 px-2 pb-3">
					<Gear className="size-4 text-muted-foreground" />
					<Text variant="label">Settings</Text>
				</div>
				{NAV_ITEMS.map((item) => (
					<button
						className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-medium text-xs transition-colors ${active === item.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-interactive-hover hover:text-foreground"}`}
						key={item.id}
						onClick={() => setActive(item.id)}
						type="button"
					>
						<item.icon className="size-3.5" />
						{item.label}
					</button>
				))}
			</nav>

			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex-1 p-6">
					{active === "general" && (
						<div className="flex flex-col gap-6">
							<div className="flex flex-col gap-1">
								<Text variant="heading">General</Text>
								<Text tone="muted" variant="caption">
									Manage your profile and account details.
								</Text>
							</div>
							<Divider />
							<div className="flex items-center gap-4">
								<Avatar alt="Iza Nassiri" size="lg" />
								<div className="flex flex-col gap-1">
									<Text variant="label">Iza Nassiri</Text>
									<Text tone="muted" variant="caption">
										iza@databuddy.cc
									</Text>
								</div>
								<Button className="ml-auto" size="sm" variant="secondary">
									Change avatar
								</Button>
							</div>
							<div className="grid gap-6 sm:grid-cols-2">
								<Field>
									<Field.Label>Full name</Field.Label>
									<Input defaultValue="Iza Nassiri" />
								</Field>
								<Field>
									<Field.Label>Email</Field.Label>
									<Input
										defaultValue="iza@databuddy.cc"
										prefix={<Globe className="size-3.5" />}
									/>
								</Field>
								<Field>
									<Field.Label>Role</Field.Label>
									<Select defaultValue="owner">
										<Select.Trigger />
										<Select.Content>
											<Select.Item value="owner">Owner</Select.Item>
											<Select.Item value="admin">Admin</Select.Item>
											<Select.Item value="member">Member</Select.Item>
											<Select.Item value="viewer">Viewer</Select.Item>
										</Select.Content>
									</Select>
								</Field>
								<Field>
									<Field.Label>Timezone</Field.Label>
									<Select defaultValue="utc3">
										<Select.Trigger />
										<Select.Content>
											<Select.Item value="utc-8">UTC-8 (Pacific)</Select.Item>
											<Select.Item value="utc-5">UTC-5 (Eastern)</Select.Item>
											<Select.Item value="utc0">UTC+0 (London)</Select.Item>
											<Select.Item value="utc1">UTC+1 (Paris)</Select.Item>
											<Select.Item value="utc3">UTC+3 (Istanbul)</Select.Item>
											<Select.Item value="utc8">UTC+8 (Singapore)</Select.Item>
										</Select.Content>
									</Select>
								</Field>
							</div>
							<Field>
								<Field.Label>Bio</Field.Label>
								<Textarea defaultValue="Building Databuddy — privacy-first analytics for the modern web." />
								<Field.Description>
									Brief description for your profile.
								</Field.Description>
							</Field>
						</div>
					)}

					{active === "notifications" && (
						<div className="flex flex-col gap-6">
							<div className="flex flex-col gap-1">
								<Text variant="heading">Notifications</Text>
								<Text tone="muted" variant="caption">
									Choose which updates you want to receive.
								</Text>
							</div>
							<Divider />
							<div className="flex flex-col gap-1">
								<Text variant="label">Email</Text>
								<Text tone="muted" variant="caption">
									Delivered to your inbox.
								</Text>
							</div>
							<div className="flex flex-col gap-4">
								<Switch
									defaultChecked
									description="Get notified when traffic spikes or drops unexpectedly."
									label="Anomaly alerts"
								/>
								<Switch
									defaultChecked
									description="A summary of your analytics every Monday at 9am."
									label="Weekly digest"
								/>
								<Switch
									description="Detailed performance report at the end of each month."
									label="Monthly report"
								/>
								<Switch
									defaultChecked
									description="Immediate alert when a monitored endpoint goes down."
									label="Uptime incidents"
								/>
							</div>
							<Divider />
							<div className="flex flex-col gap-1">
								<Text variant="label">In-app</Text>
								<Text tone="muted" variant="caption">
									Appears in your notification center.
								</Text>
							</div>
							<div className="flex flex-col gap-4">
								<Switch
									defaultChecked
									description="When someone invites you to an organization."
									label="Team invitations"
								/>
								<Switch
									defaultChecked
									description="When a tracked goal reaches its target."
									label="Goal completions"
								/>
								<Switch
									description="New features and product updates."
									label="Feature announcements"
								/>
							</div>
							<Divider />
							<Field>
								<Field.Label>Notification email</Field.Label>
								<Input
									defaultValue="iza@databuddy.cc"
									prefix={<Bell className="size-3.5" />}
								/>
								<Field.Description>
									Override the default email for notifications.
								</Field.Description>
							</Field>
						</div>
					)}

					{active === "appearance" && (
						<div className="flex flex-col gap-6">
							<div className="flex flex-col gap-1">
								<Text variant="heading">Appearance</Text>
								<Text tone="muted" variant="caption">
									Customize how the dashboard looks and feels.
								</Text>
							</div>
							<Divider />
							<div className="flex flex-col gap-1">
								<Text variant="label">Theme</Text>
								<Text tone="muted" variant="caption">
									Select your preferred color scheme.
								</Text>
							</div>
							<div className="grid grid-cols-3 gap-3">
								{(["light", "dark", "system"] as const).map((t) => (
									<button
										className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${theme === t ? "border-primary bg-primary/5" : "border-border/60 hover:border-border"}`}
										key={t}
										onClick={() => setTheme(t)}
										type="button"
									>
										{t === "light" && <Sun className="size-5" />}
										{t === "dark" && <Moon className="size-5" />}
										{t === "system" && <Gear className="size-5" />}
										<Text variant="caption">
											{t.charAt(0).toUpperCase() + t.slice(1)}
										</Text>
									</button>
								))}
							</div>
							<Divider />
							<div className="flex flex-col gap-4">
								<Switch
									defaultChecked
									description="Minimize animations throughout the interface."
									label="Reduced motion"
								/>
								<Switch
									description="Decrease spacing and font sizes for denser layouts."
									label="Compact mode"
								/>
							</div>
							<Divider />
							<div className="grid gap-6 sm:grid-cols-2">
								<Field>
									<Field.Label>Date format</Field.Label>
									<Select defaultValue="relative">
										<Select.Trigger />
										<Select.Content>
											<Select.Item value="relative">
												Relative (2 hours ago)
											</Select.Item>
											<Select.Item value="absolute">
												Absolute (Apr 19, 2026)
											</Select.Item>
											<Select.Item value="iso">
												ISO 8601 (2026-04-19)
											</Select.Item>
										</Select.Content>
									</Select>
								</Field>
								<Field>
									<Field.Label>Number format</Field.Label>
									<Select defaultValue="short">
										<Select.Trigger />
										<Select.Content>
											<Select.Item value="short">Short (12.5K)</Select.Item>
											<Select.Item value="full">Full (12,500)</Select.Item>
										</Select.Content>
									</Select>
								</Field>
							</div>
						</div>
					)}

					{active === "security" && (
						<div className="flex flex-col gap-6">
							<div className="flex flex-col gap-1">
								<Text variant="heading">Security</Text>
								<Text tone="muted" variant="caption">
									Protect your account and manage sessions.
								</Text>
							</div>
							<Divider />
							<div className="flex flex-col gap-1">
								<Text variant="label">Password</Text>
								<Text tone="muted" variant="caption">
									Update your password to keep your account secure.
								</Text>
							</div>
							<div className="grid gap-6 sm:grid-cols-2">
								<Field>
									<Field.Label>Current password</Field.Label>
									<Input
										placeholder="••••••••"
										suffix={<Lock className="size-3.5" />}
										type="password"
									/>
								</Field>
								<div />
								<Field>
									<Field.Label>New password</Field.Label>
									<Input
										placeholder="••••••••"
										suffix={<Key className="size-3.5" />}
										type="password"
									/>
								</Field>
								<Field>
									<Field.Label>Confirm password</Field.Label>
									<Input
										placeholder="••••••••"
										suffix={<Key className="size-3.5" />}
										type="password"
									/>
								</Field>
							</div>
							<Divider />
							<div className="flex flex-col gap-1">
								<Text variant="label">Two-factor authentication</Text>
								<Text tone="muted" variant="caption">
									Add an extra layer of security to your account.
								</Text>
							</div>
							<div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
								<div className="flex items-center gap-3">
									<div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
										<ShieldCheck className="size-5 text-muted-foreground" />
									</div>
									<div className="flex flex-col gap-0.5">
										<Text variant="label">Authenticator app</Text>
										<Text tone="muted" variant="caption">
											Use an app like 1Password or Authy.
										</Text>
									</div>
								</div>
								<Button size="sm" variant="secondary">
									Enable
								</Button>
							</div>
							<Divider />
							<div className="flex flex-col gap-1">
								<Text variant="label">Active sessions</Text>
								<Text tone="muted" variant="caption">
									Devices currently signed in to your account.
								</Text>
							</div>
							<div className="flex flex-col gap-3">
								{[
									{
										device: "MacBook Pro — Chrome",
										location: "Istanbul, TR",
										current: true,
									},
									{
										device: "iPhone 15 — Safari",
										location: "Istanbul, TR",
										current: false,
									},
									{
										device: "Windows PC — Firefox",
										location: "London, UK",
										current: false,
									},
								].map((s) => (
									<div
										className="flex items-center justify-between rounded-lg border border-border/60 p-3"
										key={s.device}
									>
										<div className="flex items-center gap-3">
											<div className="flex size-8 items-center justify-center rounded-md bg-secondary">
												<Globe className="size-3.5 text-muted-foreground" />
											</div>
											<div className="flex flex-col gap-0.5">
												<div className="flex items-center gap-2">
													<Text variant="caption">{s.device}</Text>
													{s.current && (
														<Badge size="sm" variant="success">
															Current
														</Badge>
													)}
												</div>
												<Text tone="muted" variant="caption">
													{s.location}
												</Text>
											</div>
										</div>
										{!s.current && (
											<Button size="sm" tone="danger" variant="ghost">
												Revoke
											</Button>
										)}
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2 border-border/60 border-t px-6 py-4">
					<Button variant="secondary">Cancel</Button>
					<Button>Save changes</Button>
				</div>
			</div>
		</div>
	);
}

const STATS = [
	{ label: "Visitors", value: "12,493", change: "+14.2%", up: true },
	{ label: "Pageviews", value: "48,271", change: "+8.7%", up: true },
	{ label: "Bounce rate", value: "34.1%", change: "-2.3%", up: false },
	{ label: "Avg. duration", value: "2m 41s", change: "+11.5%", up: true },
];

const TOP_PAGES = [
	{ path: "/", views: "8,421", pct: 100 },
	{ path: "/pricing", views: "3,102", pct: 37 },
	{ path: "/docs/getting-started", views: "2,847", pct: 34 },
	{ path: "/blog/launch-week", views: "1,923", pct: 23 },
	{ path: "/changelog", views: "1,204", pct: 14 },
];

function AnalyticsMockup() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<Text variant="heading">Analytics</Text>
						<div className="flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5">
							<StatusDot color="success" pulse size="xs" />
							<Text className="text-success" variant="caption">
								12 online
							</Text>
						</div>
					</div>
					<Text tone="muted" variant="caption">
						Last 7 days vs previous period
					</Text>
				</div>
				<div className="flex gap-2">
					<Select defaultValue="7d">
						<Select.Trigger />
						<Select.Content>
							<Select.Item value="24h">Last 24 hours</Select.Item>
							<Select.Item value="7d">Last 7 days</Select.Item>
							<Select.Item value="30d">Last 30 days</Select.Item>
							<Select.Item value="90d">Last 90 days</Select.Item>
						</Select.Content>
					</Select>
					<Button size="sm" variant="secondary">
						<ArrowUp className="size-3.5" />
						Export
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{STATS.map((s) => (
					<Card key={s.label}>
						<Card.Content className="flex flex-col gap-2 p-4">
							<Text tone="muted" variant="caption">
								{s.label}
							</Text>
							<div className="flex items-end justify-between">
								<Text variant="title">{s.value}</Text>
								<Badge size="sm" variant={s.up ? "success" : "destructive"}>
									{s.change}
								</Badge>
							</div>
							<Skeleton className="h-8 w-full rounded" />
						</Card.Content>
					</Card>
				))}
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<Card.Header>
						<Card.Title>Traffic</Card.Title>
						<Card.Description>Unique visitors over time</Card.Description>
					</Card.Header>
					<Card.Content>
						<Skeleton className="h-48 w-full rounded" />
					</Card.Content>
				</Card>
				<Card>
					<Card.Header>
						<Card.Title>Top pages</Card.Title>
						<Card.Description>By pageviews</Card.Description>
					</Card.Header>
					<Card.Content className="flex flex-col gap-3">
						{TOP_PAGES.map((p) => (
							<div className="flex items-center gap-3" key={p.path}>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<Text className="truncate" mono variant="caption">
										{p.path}
									</Text>
									<Progress size="sm" value={p.pct} />
								</div>
								<Text
									className="shrink-0 tabular-nums"
									mono
									tone="muted"
									variant="caption"
								>
									{p.views}
								</Text>
							</div>
						))}
					</Card.Content>
				</Card>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<Card.Header>
						<Card.Title>Referrers</Card.Title>
					</Card.Header>
					<Card.Content className="flex flex-col gap-2">
						{[
							{ source: "google.com", count: "4,218" },
							{ source: "twitter.com", count: "1,847" },
							{ source: "github.com", count: "1,203" },
							{ source: "Direct", count: "3,891" },
						].map((r) => (
							<div
								className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
								key={r.source}
							>
								<div className="flex items-center gap-2">
									<Globe className="size-3.5 text-muted-foreground" />
									<Text variant="caption">{r.source}</Text>
								</div>
								<Text mono tone="muted" variant="caption">
									{r.count}
								</Text>
							</div>
						))}
					</Card.Content>
				</Card>
				<Card>
					<Card.Header>
						<Card.Title>Devices</Card.Title>
					</Card.Header>
					<Card.Content className="flex flex-col gap-3">
						{[
							{ device: "Desktop", pct: 62 },
							{ device: "Mobile", pct: 31 },
							{ device: "Tablet", pct: 7 },
						].map((d) => (
							<div className="flex items-center gap-3" key={d.device}>
								<Text className="w-16 shrink-0" variant="caption">
									{d.device}
								</Text>
								<Progress className="flex-1" size="sm" value={d.pct} />
								<Text
									className="w-8 shrink-0 text-right tabular-nums"
									mono
									tone="muted"
									variant="caption"
								>
									{d.pct}%
								</Text>
							</div>
						))}
					</Card.Content>
				</Card>
			</div>
		</div>
	);
}

const MEMBERS = [
	{
		name: "Iza Nassiri",
		email: "iza@databuddy.cc",
		role: "Owner",
		status: "active" as const,
	},
	{
		name: "Sarah Chen",
		email: "sarah@databuddy.cc",
		role: "Admin",
		status: "active" as const,
	},
	{
		name: "Alex Rivera",
		email: "alex@databuddy.cc",
		role: "Member",
		status: "active" as const,
	},
	{
		name: "Jordan Park",
		email: "jordan@databuddy.cc",
		role: "Member",
		status: "active" as const,
	},
	{
		name: "Morgan Liu",
		email: "morgan@company.com",
		role: "Viewer",
		status: "pending" as const,
	},
];

function TeamMockup() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div className="flex flex-col gap-1">
					<Text variant="heading">Team</Text>
					<Text tone="muted" variant="caption">
						{MEMBERS.length} members in this workspace
					</Text>
				</div>
				<Dialog>
					<Dialog.Trigger
						render={
							<Button size="sm">
								<Plus className="size-3.5" />
								Invite
							</Button>
						}
					/>
					<Dialog.Content>
						<Dialog.Close />
						<Dialog.Header>
							<Dialog.Title>Invite teammate</Dialog.Title>
							<Dialog.Description>
								They'll receive an email with a link to join.
							</Dialog.Description>
						</Dialog.Header>
						<Dialog.Body className="flex flex-col gap-4">
							<Field>
								<Field.Label>Email</Field.Label>
								<Input
									placeholder="name@company.com"
									prefix={<EnvelopeSimple className="size-3.5" />}
								/>
							</Field>
							<Field>
								<Field.Label>Role</Field.Label>
								<Select defaultValue="member">
									<Select.Trigger />
									<Select.Content>
										<Select.Item value="admin">Admin</Select.Item>
										<Select.Item value="member">Member</Select.Item>
										<Select.Item value="viewer">Viewer</Select.Item>
									</Select.Content>
								</Select>
							</Field>
							<Field>
								<Field.Label>Message (optional)</Field.Label>
								<Textarea placeholder="Hey, join our analytics workspace!" />
							</Field>
						</Dialog.Body>
						<Dialog.Footer>
							<Dialog.Close>
								<Button variant="secondary">Cancel</Button>
							</Dialog.Close>
							<Button>
								<PaperPlaneTilt className="size-3.5" />
								Send invite
							</Button>
						</Dialog.Footer>
					</Dialog.Content>
				</Dialog>
			</div>

			<div className="flex gap-2">
				<Input
					className="max-w-xs"
					placeholder="Search members..."
					prefix={<MagnifyingGlass className="size-3.5" />}
				/>
				<Select defaultValue="all">
					<Select.Trigger />
					<Select.Content>
						<Select.Item value="all">All roles</Select.Item>
						<Select.Item value="owner">Owner</Select.Item>
						<Select.Item value="admin">Admin</Select.Item>
						<Select.Item value="member">Member</Select.Item>
						<Select.Item value="viewer">Viewer</Select.Item>
					</Select.Content>
				</Select>
			</div>

			<div className="overflow-hidden rounded-xl border border-border/60">
				<div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-border/60 border-b bg-muted/30 px-4 py-2.5">
					<Text mono tone="muted" variant="caption">
						Member
					</Text>
					<Text
						className="w-20 text-center"
						mono
						tone="muted"
						variant="caption"
					>
						Role
					</Text>
					<Text
						className="w-20 text-center"
						mono
						tone="muted"
						variant="caption"
					>
						Status
					</Text>
					<Text className="w-10" mono tone="muted" variant="caption" />
				</div>
				{MEMBERS.map((m) => (
					<div
						className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-border/60 border-b px-4 py-3 last:border-b-0"
						key={m.email}
					>
						<div className="flex items-center gap-3">
							<Avatar alt={m.name} size="sm" />
							<div className="flex flex-col">
								<Text variant="caption">{m.name}</Text>
								<Text tone="muted" variant="caption">
									{m.email}
								</Text>
							</div>
						</div>
						<Badge
							className="w-20 justify-center"
							size="sm"
							variant={m.role === "Owner" ? "primary" : "default"}
						>
							{m.role}
						</Badge>
						<div className="flex w-20 items-center justify-center gap-1.5">
							<StatusDot
								color={m.status === "active" ? "success" : "warning"}
								pulse={m.status === "active"}
								size="sm"
							/>
							<Text variant="caption">
								{m.status === "active" ? "Active" : "Pending"}
							</Text>
						</div>
						<div className="flex w-10 justify-end">
							{m.role !== "Owner" && (
								<DropdownMenu>
									<DropdownMenu.Trigger
										render={
											<Button size="sm" variant="ghost">
												<DotsThree className="size-3.5" />
											</Button>
										}
									/>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item>
											<Gear className="size-3.5" />
											Change role
										</DropdownMenu.Item>
										{m.status === "pending" && (
											<DropdownMenu.Item>
												<PaperPlaneTilt className="size-3.5" />
												Resend invite
											</DropdownMenu.Item>
										)}
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive">
											<Trash className="size-3.5" />
											Remove
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

const PLANS = [
	{
		name: "Free",
		price: "$0",
		description: "For hobby projects",
		features: [
			"1 website",
			"10K events/mo",
			"30-day retention",
			"Community support",
		],
		current: false,
		cta: "Downgrade",
	},
	{
		name: "Pro",
		price: "$29",
		description: "For growing teams",
		features: [
			"10 websites",
			"1M events/mo",
			"1-year retention",
			"Priority support",
			"Custom events",
			"API access",
		],
		current: true,
		cta: "Current plan",
	},
	{
		name: "Enterprise",
		price: "$99",
		description: "For large organizations",
		features: [
			"Unlimited websites",
			"10M events/mo",
			"Unlimited retention",
			"Dedicated support",
			"SSO & SAML",
			"SLA guarantee",
		],
		current: false,
		cta: "Upgrade",
	},
];

function BillingMockup() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div className="flex flex-col gap-1">
					<Text variant="heading">Billing</Text>
					<Text tone="muted" variant="caption">
						Manage your plan and payment method.
					</Text>
				</div>
				<Badge size="sm" variant="primary">
					Pro plan
				</Badge>
			</div>

			<Card>
				<Card.Header>
					<Card.Title>Usage this period</Card.Title>
					<Card.Description>Apr 1 — Apr 19, 2026</Card.Description>
				</Card.Header>
				<Card.Content className="flex flex-col gap-4">
					{[
						{ label: "Events", used: 284_000, limit: 1_000_000 },
						{ label: "Websites", used: 4, limit: 10 },
						{ label: "Team members", used: 5, limit: 20 },
					].map((u) => (
						<div className="flex flex-col gap-1.5" key={u.label}>
							<div className="flex items-center justify-between">
								<Text variant="caption">{u.label}</Text>
								<Text mono tone="muted" variant="caption">
									{u.used.toLocaleString()} / {u.limit.toLocaleString()}
								</Text>
							</div>
							<Progress
								tone={u.used / u.limit > 0.8 ? "danger" : "primary"}
								value={(u.used / u.limit) * 100}
							/>
						</div>
					))}
				</Card.Content>
			</Card>

			<div className="grid gap-4 lg:grid-cols-3">
				{PLANS.map((plan) => (
					<Card
						className={plan.current ? "ring-2 ring-primary" : ""}
						key={plan.name}
					>
						<Card.Content className="flex flex-col gap-4 p-5">
							<div className="flex items-center justify-between">
								<Text variant="label">{plan.name}</Text>
								{plan.current && (
									<Badge size="sm" variant="primary">
										Current
									</Badge>
								)}
							</div>
							<div className="flex items-baseline gap-1">
								<Text variant="display">{plan.price}</Text>
								<Text tone="muted" variant="caption">
									/month
								</Text>
							</div>
							<Text tone="muted" variant="caption">
								{plan.description}
							</Text>
							<Divider />
							<div className="flex flex-col gap-2">
								{plan.features.map((f) => (
									<div className="flex items-center gap-2" key={f}>
										<Check className="size-3.5 shrink-0 text-primary" />
										<Text variant="caption">{f}</Text>
									</div>
								))}
							</div>
							<Button
								className="mt-2"
								disabled={plan.current}
								variant={plan.current ? "secondary" : "primary"}
							>
								{plan.cta}
							</Button>
						</Card.Content>
					</Card>
				))}
			</div>

			<Card>
				<Card.Header>
					<Card.Title>Payment method</Card.Title>
					<Card.Description>
						Your card will be charged on the 1st of each month.
					</Card.Description>
				</Card.Header>
				<Card.Content className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
							<CreditCard className="size-5 text-muted-foreground" />
						</div>
						<div className="flex flex-col gap-0.5">
							<Text variant="caption">Visa ending in 4242</Text>
							<Text tone="muted" variant="caption">
								Expires 12/2027
							</Text>
						</div>
					</div>
					<Button size="sm" variant="secondary">
						Update
					</Button>
				</Card.Content>
				<Card.Footer>
					<div className="flex flex-col gap-0.5">
						<Text tone="muted" variant="caption">
							Next invoice: May 1, 2026
						</Text>
						<Text tone="muted" variant="caption">
							Estimated amount: $29.00
						</Text>
					</div>
				</Card.Footer>
			</Card>
		</div>
	);
}

const ONBOARDING_STEPS = [
	{ id: 1, label: "Create workspace", icon: Rocket },
	{ id: 2, label: "Add website", icon: Globe },
	{ id: 3, label: "Install tracking", icon: Lightning },
	{ id: 4, label: "Invite team", icon: UsersThree },
];

function OnboardingMockup() {
	const [step, setStep] = useState(2);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
			<div className="flex flex-col items-center gap-2 text-center">
				<Text variant="display">Welcome to Databuddy</Text>
				<Text className="max-w-md" tone="muted" variant="body">
					Let's get your analytics up and running. This takes about 5 minutes.
				</Text>
			</div>

			<div className="flex items-center justify-center gap-2">
				{ONBOARDING_STEPS.map((s, i) => (
					<div className="flex items-center gap-2" key={s.id}>
						<button
							className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-xs transition-colors ${
								s.id < step
									? "bg-primary/10 text-primary"
									: s.id === step
										? "bg-primary text-primary-foreground"
										: "bg-secondary text-muted-foreground"
							}`}
							onClick={() => setStep(s.id)}
							type="button"
						>
							{s.id < step ? (
								<CheckCircle className="size-3.5" />
							) : (
								<s.icon className="size-3.5" />
							)}
							{s.label}
						</button>
						{i < ONBOARDING_STEPS.length - 1 && (
							<CaretRight className="size-3 text-muted-foreground/50" />
						)}
					</div>
				))}
			</div>

			<Card>
				{step === 1 && (
					<Card.Content className="flex flex-col gap-6 p-6">
						<div className="flex flex-col gap-1">
							<Text variant="heading">Create your workspace</Text>
							<Text tone="muted" variant="caption">
								This is where your team's analytics live.
							</Text>
						</div>
						<div className="grid gap-6 sm:grid-cols-2">
							<Field>
								<Field.Label>Workspace name</Field.Label>
								<Input defaultValue="Acme Inc" />
							</Field>
							<Field>
								<Field.Label>Workspace URL</Field.Label>
								<Input defaultValue="acme-inc" prefix="dby.cc/" />
							</Field>
						</div>
					</Card.Content>
				)}

				{step === 2 && (
					<Card.Content className="flex flex-col gap-6 p-6">
						<div className="flex flex-col gap-1">
							<Text variant="heading">Add your first website</Text>
							<Text tone="muted" variant="caption">
								Enter the domain you want to track.
							</Text>
						</div>
						<div className="grid gap-6 sm:grid-cols-2">
							<Field>
								<Field.Label>Website name</Field.Label>
								<Input defaultValue="Marketing site" />
							</Field>
							<Field>
								<Field.Label>Domain</Field.Label>
								<Input
									defaultValue="acme.com"
									prefix={<Globe className="size-3.5" />}
								/>
							</Field>
						</div>
						<Field>
							<Field.Label>Category</Field.Label>
							<Select defaultValue="saas">
								<Select.Trigger />
								<Select.Content>
									<Select.Item value="saas">SaaS</Select.Item>
									<Select.Item value="ecommerce">E-commerce</Select.Item>
									<Select.Item value="blog">Blog</Select.Item>
									<Select.Item value="docs">Documentation</Select.Item>
									<Select.Item value="other">Other</Select.Item>
								</Select.Content>
							</Select>
						</Field>
					</Card.Content>
				)}

				{step === 3 && (
					<Card.Content className="flex flex-col gap-6 p-6">
						<div className="flex flex-col gap-1">
							<Text variant="heading">Install the tracking script</Text>
							<Text tone="muted" variant="caption">
								Add this snippet to your site's &lt;head&gt; tag.
							</Text>
						</div>
						<div className="relative rounded-lg bg-muted/50 p-4 pr-12">
							<Text className="break-all" mono variant="caption">
								{
									'<script defer src="https://cdn.databuddy.cc/tracker.js" data-client-id="ck_live_abc123"></script>'
								}
							</Text>
							<CopyButton
								className="absolute top-2 right-2"
								value='<script defer src="https://cdn.databuddy.cc/tracker.js" data-client-id="ck_live_abc123"></script>'
							/>
						</div>
						<Divider />
						<div className="flex flex-col gap-1">
							<Text variant="label">Or install via npm</Text>
							<Text tone="muted" variant="caption">
								For React, Next.js, and other frameworks.
							</Text>
						</div>
						<div className="relative rounded-lg bg-muted/50 p-4 pr-12">
							<Text mono variant="caption">
								npm install @databuddy/sdk
							</Text>
							<CopyButton
								className="absolute top-2 right-2"
								value="npm install @databuddy/sdk"
							/>
						</div>
						<div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
							<Clock className="size-4 shrink-0 text-primary" />
							<Text variant="caption">
								Waiting for first event... this usually takes under a minute.
							</Text>
							<Spinner className="ml-auto" size="sm" />
						</div>
					</Card.Content>
				)}

				{step === 4 && (
					<Card.Content className="flex flex-col gap-6 p-6">
						<div className="flex flex-col gap-1">
							<Text variant="heading">Invite your team</Text>
							<Text tone="muted" variant="caption">
								Analytics is better together. You can always do this later.
							</Text>
						</div>
						<div className="flex flex-col gap-3">
							{[0, 1, 2].map((i) => (
								<div className="flex gap-3" key={i}>
									<Input
										className="flex-1"
										placeholder="name@company.com"
										prefix={<EnvelopeSimple className="size-3.5" />}
									/>
									<Select defaultValue="member">
										<Select.Trigger />
										<Select.Content>
											<Select.Item value="admin">Admin</Select.Item>
											<Select.Item value="member">Member</Select.Item>
											<Select.Item value="viewer">Viewer</Select.Item>
										</Select.Content>
									</Select>
								</div>
							))}
						</div>
						<Button className="self-start" size="sm" variant="ghost">
							<Plus className="size-3.5" />
							Add another
						</Button>
					</Card.Content>
				)}

				<Card.Footer>
					<Button
						disabled={step === 1}
						onClick={() => setStep(Math.max(1, step - 1))}
						variant="secondary"
					>
						Back
					</Button>
					{step < 4 ? (
						<Button onClick={() => setStep(Math.min(4, step + 1))}>
							Continue
							<ArrowRight className="size-3.5" />
						</Button>
					) : (
						<Button>
							<CheckCircle className="size-3.5" />
							Finish setup
						</Button>
					)}
					{step === 4 && (
						<Button className="ml-auto" variant="ghost">
							Skip for now
						</Button>
					)}
				</Card.Footer>
			</Card>
		</div>
	);
}
