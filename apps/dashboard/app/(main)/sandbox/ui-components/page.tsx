"use client";

import {
	AlertCircle,
	CheckCircle,
	Heart,
	Info,
	Layout,
	Palette,
	Star,
	ThumbsUp,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function UiComponentsPage() {
	const [switchValue, setSwitchValue] = useState(false);
	const [sliderValue, setSliderValue] = useState([50]);
	const [progress, setProgress] = useState(33);

	return (
		<div className="container mx-auto max-w-6xl p-6">
			<div className="mb-6">
				<h1 className="mb-2 font-bold text-2xl text-foreground">
					UI Components Testing
				</h1>
				<p className="text-muted-foreground">
					Test and preview UI components and layouts
				</p>
			</div>

			<Tabs className="space-y-6" defaultValue="buttons">
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="buttons">Buttons</TabsTrigger>
					<TabsTrigger value="forms">Forms</TabsTrigger>
					<TabsTrigger value="feedback">Feedback</TabsTrigger>
					<TabsTrigger value="layout">Layout</TabsTrigger>
				</TabsList>

				<TabsContent className="space-y-6" value="buttons">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Zap className="h-5 w-5" />
								Button Variants
							</CardTitle>
							<CardDescription>
								Different button styles and states
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<h4 className="mb-3 font-medium text-sm">Primary Buttons</h4>
								<div className="flex flex-wrap gap-3">
									<Button>Default</Button>
									<Button size="sm">Small</Button>
									<Button size="lg">Large</Button>
									<Button disabled>Disabled</Button>
								</div>
							</div>

							<div>
								<h4 className="mb-3 font-medium text-sm">Secondary Buttons</h4>
								<div className="flex flex-wrap gap-3">
									<Button variant="secondary">Secondary</Button>
									<Button variant="outline">Outline</Button>
									<Button variant="ghost">Ghost</Button>
									<Button variant="link">Link</Button>
								</div>
							</div>

							<div>
								<h4 className="mb-3 font-medium text-sm">
									Destructive Buttons
								</h4>
								<div className="flex flex-wrap gap-3">
									<Button variant="destructive">Delete</Button>
									<Button size="sm" variant="destructive">
										Remove
									</Button>
									<Button disabled variant="destructive">
										Disabled
									</Button>
								</div>
							</div>

							<div>
								<h4 className="mb-3 font-medium text-sm">Icon Buttons</h4>
								<div className="flex flex-wrap gap-3">
									<Button className="flex items-center gap-2">
										<Star className="h-4 w-4" />
										Favorite
									</Button>
									<Button className="flex items-center gap-2" variant="outline">
										<Heart className="h-4 w-4" />
										Like
									</Button>
									<Button className="flex items-center gap-2" variant="ghost">
										<ThumbsUp className="h-4 w-4" />
										Approve
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent className="space-y-6" value="forms">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Layout className="h-5 w-5" />
								Form Components
							</CardTitle>
							<CardDescription>Input fields and form controls</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="text-input">Text Input</Label>
									<Input id="text-input" placeholder="Enter some text..." />
								</div>
								<div className="space-y-2">
									<Label htmlFor="email-input">Email Input</Label>
									<Input
										id="email-input"
										placeholder="email@example.com"
										type="email"
									/>
								</div>
							</div>

							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Enable Notifications</Label>
										<p className="text-muted-foreground text-sm">
											Receive email notifications for updates
										</p>
									</div>
									<Switch
										checked={switchValue}
										onCheckedChange={setSwitchValue}
									/>
								</div>

								<div className="space-y-2">
									<Label>Volume: {sliderValue[0]}</Label>
									<Slider
										className="w-full"
										max={100}
										onValueChange={setSliderValue}
										step={1}
										value={sliderValue}
									/>
								</div>

								<div className="space-y-2">
									<Label>Progress: {progress}%</Label>
									<Progress className="w-full" value={progress} />
									<div className="flex gap-2">
										<Button
											onClick={() => setProgress(Math.max(0, progress - 10))}
											size="sm"
											variant="outline"
										>
											-10%
										</Button>
										<Button
											onClick={() => setProgress(Math.min(100, progress + 10))}
											size="sm"
											variant="outline"
										>
											+10%
										</Button>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent className="space-y-6" value="feedback">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<AlertCircle className="h-5 w-5" />
								Feedback Components
							</CardTitle>
							<CardDescription>
								Alerts, badges, and status indicators
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<h4 className="mb-3 font-medium text-sm">Badges</h4>
								<div className="flex flex-wrap gap-3">
									<Badge>Default</Badge>
									<Badge variant="secondary">Secondary</Badge>
									<Badge variant="outline">Outline</Badge>
									<Badge variant="destructive">Error</Badge>
									<Badge className="bg-green-100 text-green-800 hover:bg-green-200">
										Success
									</Badge>
									<Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
										Warning
									</Badge>
								</div>
							</div>

							<div className="space-y-4">
								<h4 className="font-medium text-sm">Alerts</h4>

								<Alert>
									<Info className="h-4 w-4" />
									<AlertTitle>Information</AlertTitle>
									<AlertDescription>
										This is an informational alert with some helpful details.
									</AlertDescription>
								</Alert>

								<Alert className="border-green-200 bg-green-50 text-green-800">
									<CheckCircle className="h-4 w-4" />
									<AlertTitle>Success</AlertTitle>
									<AlertDescription>
										Your changes have been saved successfully.
									</AlertDescription>
								</Alert>

								<Alert className="border-yellow-200 bg-yellow-50 text-yellow-800">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Warning</AlertTitle>
									<AlertDescription>
										Please review your settings before continuing.
									</AlertDescription>
								</Alert>

								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>
										Something went wrong. Please try again.
									</AlertDescription>
								</Alert>
							</div>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent className="space-y-6" value="layout">
					<div className="grid gap-6 md:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Palette className="h-5 w-5" />
									Color Palette
								</CardTitle>
								<CardDescription>Theme colors and variations</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-4 gap-2">
									<div className="space-y-2">
										<div className="h-12 w-full rounded bg-primary" />
										<p className="text-center text-xs">Primary</p>
									</div>
									<div className="space-y-2">
										<div className="h-12 w-full rounded bg-secondary" />
										<p className="text-center text-xs">Secondary</p>
									</div>
									<div className="space-y-2">
										<div className="h-12 w-full rounded bg-accent" />
										<p className="text-center text-xs">Accent</p>
									</div>
									<div className="space-y-2">
										<div className="h-12 w-full rounded bg-muted" />
										<p className="text-center text-xs">Muted</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Typography</CardTitle>
								<CardDescription>Text styles and hierarchy</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								<h1 className="font-bold text-3xl">Heading 1</h1>
								<h2 className="font-semibold text-2xl">Heading 2</h2>
								<h3 className="font-medium text-xl">Heading 3</h3>
								<p className="text-base">
									Regular text paragraph with normal styling.
								</p>
								<p className="text-muted-foreground text-sm">
									Small muted text for descriptions.
								</p>
								<code className="rounded bg-muted px-2 py-1 font-mono text-sm">
									Inline code
								</code>
							</CardContent>
						</Card>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
