import {
	IconBell,
	IconBluetooth,
	IconCreditCard,
	IconDeviceDesktop,
	IconDeviceFloppy,
	IconDots,
	IconDotsVertical,
	IconDownload,
	IconEye,
	IconFile,
	IconFileCode,
	IconFileText,
	IconFolder,
	IconFolderOpen,
	IconFolderSearch,
	IconHelpCircle,
	IconKeyboard,
	IconLanguage,
	IconLayout,
	IconLogout,
	IconMail,
	IconMoon,
	IconPalette,
	IconPlus,
	IconSettings,
	IconShield,
	IconSun,
	IconUser,
} from "@tabler/icons-react";
import * as React from "react";
import { Example, ExampleWrapper } from "@/components/example";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ComponentExample() {
	return (
		<ExampleWrapper>
			<CardExample />
			<FormExample />
		</ExampleWrapper>
	);
}

function CardExample() {
	return (
		<Example className="items-center justify-center" title="Card">
			<Card className="relative w-full max-w-sm overflow-hidden pt-0">
				<div className="absolute inset-0 z-30 aspect-video bg-primary opacity-50 mix-blend-color" />
				<img
					alt="Photo by mymind on Unsplash"
					className="relative z-20 aspect-video w-full object-cover brightness-60 grayscale"
					src="https://images.unsplash.com/photo-1604076850742-4c7221f3101b?q=80&w=1887&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
					title="Photo by mymind on Unsplash"
				/>
				<CardHeader>
					<CardTitle>Observability Plus is replacing Monitoring</CardTitle>
					<CardDescription>
						Switch to the improved way to explore your data, with natural
						language. Monitoring will no longer be available on the Pro plan in
						November, 2025
					</CardDescription>
				</CardHeader>
				<CardFooter>
					<AlertDialog>
						<AlertDialogTrigger render={<Button />}>
							<IconPlus data-icon="inline-start" />
							Show Dialog
						</AlertDialogTrigger>
						<AlertDialogContent size="sm">
							<AlertDialogHeader>
								<AlertDialogMedia>
									<IconBluetooth />
								</AlertDialogMedia>
								<AlertDialogTitle>Allow accessory to connect?</AlertDialogTitle>
								<AlertDialogDescription>
									Do you want to allow the USB accessory to connect to this
									device?
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Don&apos;t allow</AlertDialogCancel>
								<AlertDialogAction>Allow</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					<Badge className="ml-auto" variant="secondary ">
						Warning
					</Badge>
				</CardFooter>
			</Card>
		</Example>
	);
}

const frameworks = [
	"Next.js",
	"SvelteKit",
	"Nuxt.js",
	"Remix",
	"Astro",
] as const;

const roleItems = [
	{ label: "Developer", value: "developer" },
	{ label: "Designer", value: "designer" },
	{ label: "Manager", value: "manager" },
	{ label: "Other", value: "other" },
];

function FormExample() {
	const [notifications, setNotifications] = React.useState({
		email: true,
		sms: false,
		push: true,
	});
	const [theme, setTheme] = React.useState("light");

	return (
		<Example title="Form">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>User Information</CardTitle>
					<CardDescription>Please fill in your details below</CardDescription>
					<CardAction>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={<Button size="icon" variant="ghost" />}
							>
								<IconDotsVertical />
								<span className="sr-only">More options</span>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuGroup>
									<DropdownMenuLabel>File</DropdownMenuLabel>
									<DropdownMenuItem>
										<IconFile />
										New File
										<DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
									</DropdownMenuItem>
									<DropdownMenuItem>
										<IconFolder />
										New Folder
										<DropdownMenuShortcut>⇧⌘N</DropdownMenuShortcut>
									</DropdownMenuItem>
									<DropdownMenuSub>
										<DropdownMenuSubTrigger>
											<IconFolderOpen />
											Open Recent
										</DropdownMenuSubTrigger>
										<DropdownMenuPortal>
											<DropdownMenuSubContent>
												<DropdownMenuGroup>
													<DropdownMenuLabel>Recent Projects</DropdownMenuLabel>
													<DropdownMenuItem>
														<IconFileCode />
														Project Alpha
													</DropdownMenuItem>
													<DropdownMenuItem>
														<IconFileCode />
														Project Beta
													</DropdownMenuItem>
													<DropdownMenuSub>
														<DropdownMenuSubTrigger>
															<IconDots />
															More Projects
														</DropdownMenuSubTrigger>
														<DropdownMenuPortal>
															<DropdownMenuSubContent>
																<DropdownMenuItem>
																	<IconFileCode />
																	Project Gamma
																</DropdownMenuItem>
																<DropdownMenuItem>
																	<IconFileCode />
																	Project Delta
																</DropdownMenuItem>
															</DropdownMenuSubContent>
														</DropdownMenuPortal>
													</DropdownMenuSub>
												</DropdownMenuGroup>
												<DropdownMenuSeparator />
												<DropdownMenuGroup>
													<DropdownMenuItem>
														<IconFolderSearch />
														Browse...
													</DropdownMenuItem>
												</DropdownMenuGroup>
											</DropdownMenuSubContent>
										</DropdownMenuPortal>
									</DropdownMenuSub>
									<DropdownMenuSeparator />
									<DropdownMenuItem>
										<IconDeviceFloppy />
										Save
										<DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
									</DropdownMenuItem>
									<DropdownMenuItem>
										<IconDownload />
										Export
										<DropdownMenuShortcut>⇧⌘E</DropdownMenuShortcut>
									</DropdownMenuItem>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuLabel>View</DropdownMenuLabel>
									<DropdownMenuCheckboxItem
										checked={notifications.email}
										onCheckedChange={(checked) =>
											setNotifications({
												...notifications,
												email: checked === true,
											})
										}
									>
										<IconEye />
										Show Sidebar
									</DropdownMenuCheckboxItem>
									<DropdownMenuCheckboxItem
										checked={notifications.sms}
										onCheckedChange={(checked) =>
											setNotifications({
												...notifications,
												sms: checked === true,
											})
										}
									>
										<IconLayout />
										Show Status Bar
									</DropdownMenuCheckboxItem>
									<DropdownMenuSub>
										<DropdownMenuSubTrigger>
											<IconPalette />
											Theme
										</DropdownMenuSubTrigger>
										<DropdownMenuPortal>
											<DropdownMenuSubContent>
												<DropdownMenuGroup>
													<DropdownMenuLabel>Appearance</DropdownMenuLabel>
													<DropdownMenuRadioGroup
														onValueChange={setTheme}
														value={theme}
													>
														<DropdownMenuRadioItem value="light">
															<IconSun />
															Light
														</DropdownMenuRadioItem>
														<DropdownMenuRadioItem value="dark">
															<IconMoon />
															Dark
														</DropdownMenuRadioItem>
														<DropdownMenuRadioItem value="system">
															<IconDeviceDesktop />
															System
														</DropdownMenuRadioItem>
													</DropdownMenuRadioGroup>
												</DropdownMenuGroup>
											</DropdownMenuSubContent>
										</DropdownMenuPortal>
									</DropdownMenuSub>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuLabel>Account</DropdownMenuLabel>
									<DropdownMenuItem>
										<IconUser />
										Profile
										<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
									</DropdownMenuItem>
									<DropdownMenuItem>
										<IconCreditCard />
										Billing
									</DropdownMenuItem>
									<DropdownMenuSub>
										<DropdownMenuSubTrigger>
											<IconSettings />
											Settings
										</DropdownMenuSubTrigger>
										<DropdownMenuPortal>
											<DropdownMenuSubContent>
												<DropdownMenuGroup>
													<DropdownMenuLabel>Preferences</DropdownMenuLabel>
													<DropdownMenuItem>
														<IconKeyboard />
														Keyboard Shortcuts
													</DropdownMenuItem>
													<DropdownMenuItem>
														<IconLanguage />
														Language
													</DropdownMenuItem>
													<DropdownMenuSub>
														<DropdownMenuSubTrigger>
															<IconBell />
															Notifications
														</DropdownMenuSubTrigger>
														<DropdownMenuPortal>
															<DropdownMenuSubContent>
																<DropdownMenuGroup>
																	<DropdownMenuLabel>
																		Notification Types
																	</DropdownMenuLabel>
																	<DropdownMenuCheckboxItem
																		checked={notifications.push}
																		onCheckedChange={(checked) =>
																			setNotifications({
																				...notifications,
																				push: checked === true,
																			})
																		}
																	>
																		<IconBell />
																		Push Notifications
																	</DropdownMenuCheckboxItem>
																	<DropdownMenuCheckboxItem
																		checked={notifications.email}
																		onCheckedChange={(checked) =>
																			setNotifications({
																				...notifications,
																				email: checked === true,
																			})
																		}
																	>
																		<IconMail />
																		Email Notifications
																	</DropdownMenuCheckboxItem>
																</DropdownMenuGroup>
															</DropdownMenuSubContent>
														</DropdownMenuPortal>
													</DropdownMenuSub>
												</DropdownMenuGroup>
												<DropdownMenuSeparator />
												<DropdownMenuGroup>
													<DropdownMenuItem>
														<IconShield />
														Privacy & Security
													</DropdownMenuItem>
												</DropdownMenuGroup>
											</DropdownMenuSubContent>
										</DropdownMenuPortal>
									</DropdownMenuSub>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuItem>
										<IconHelpCircle />
										Help & Support
									</DropdownMenuItem>
									<DropdownMenuItem>
										<IconFileText />
										Documentation
									</DropdownMenuItem>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuItem variant="destructive">
										<IconLogout />
										Sign Out
										<DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</CardAction>
				</CardHeader>
				<CardContent>
					<form>
						<FieldGroup>
							<div className="grid grid-cols-2 gap-4">
								<Field>
									<FieldLabel htmlFor="small-form-name">Name</FieldLabel>
									<Input
										id="small-form-name"
										placeholder="Enter your name"
										required
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="small-form-role">Role</FieldLabel>
									<Select defaultValue={null} items={roleItems}>
										<SelectTrigger id="small-form-role">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{roleItems.map((item) => (
													<SelectItem key={item.value} value={item.value}>
														{item.label}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
							</div>
							<Field>
								<FieldLabel htmlFor="small-form-framework">
									Framework
								</FieldLabel>
								<Combobox items={frameworks}>
									<ComboboxInput
										id="small-form-framework"
										placeholder="Select a framework"
										required
									/>
									<ComboboxContent>
										<ComboboxEmpty>No frameworks found.</ComboboxEmpty>
										<ComboboxList>
											{(item) => (
												<ComboboxItem key={item} value={item}>
													{item}
												</ComboboxItem>
											)}
										</ComboboxList>
									</ComboboxContent>
								</Combobox>
							</Field>
							<Field>
								<FieldLabel htmlFor="small-form-comments">Comments</FieldLabel>
								<Textarea
									id="small-form-comments"
									placeholder="Add any additional comments"
								/>
							</Field>
							<Field orientation="horizontal">
								<Button type="submit">Submit</Button>
								<Button type="button" variant="outline">
									Cancel
								</Button>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</Example>
	);
}
