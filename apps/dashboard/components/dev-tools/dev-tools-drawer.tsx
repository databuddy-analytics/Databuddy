"use client";

import type { Icon } from "@phosphor-icons/react";
import { BugIcon, GearIcon, XIcon } from "@phosphor-icons/react";
import type { PrimitiveAtom, WritableAtom } from "jotai";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

type SettingOption<T extends string> = {
	value: T;
	label: string;
	description: string;
	icon: Icon;
};

type RadioSetting<T extends string> = {
	type: "radio";
	id: string;
	title: string;
	description: string;
	atom: WritableAtom<T, [T], void> | PrimitiveAtom<T>;
	options: SettingOption<T>[];
};

type DevSetting = RadioSetting<string>;

const DEV_SETTINGS: DevSetting[] = [];

function RadioSettingGroup({ setting }: { setting: RadioSetting<string> }) {
	const [value, setValue] = useAtom(setting.atom);

	return (
		<div>
			<h3 className="mb-1 font-medium text-sm">{setting.title}</h3>
			<p className="mb-3 text-muted-foreground text-xs">
				{setting.description}
			</p>
			<RadioGroup className="gap-2" onValueChange={setValue} value={value}>
				{setting.options.map((option) => {
					const OptionIcon = option.icon;
					const inputId = `${setting.id}-${option.value}`;
					return (
						<label
							className="flex cursor-pointer items-start gap-3 rounded border p-3 hover:bg-accent [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
							htmlFor={inputId}
							key={option.value}
						>
							<RadioGroupItem
								className="mt-0.5"
								id={inputId}
								value={option.value}
							/>
							<div className="flex-1 space-y-1">
								<div className="flex items-center gap-2">
									<OptionIcon className="size-4" weight="duotone" />
									<Label
										className="cursor-pointer font-medium"
										htmlFor={inputId}
									>
										{option.label}
									</Label>
								</div>
								<p className="text-muted-foreground text-xs">
									{option.description}
								</p>
							</div>
						</label>
					);
				})}
			</RadioGroup>
		</div>
	);
}

function SettingRenderer({ setting }: { setting: DevSetting }) {
	switch (setting.type) {
		case "radio":
			return <RadioSettingGroup setting={setting} />;
		default:
			return null;
	}
}

export function DevToolsDrawer() {
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const [isLocalhost, setIsLocalhost] = useState(false);

	useEffect(() => {
		setMounted(true);
		const hostname = window.location.hostname;
		setIsLocalhost(hostname === "localhost" || hostname === "127.0.0.1");
	}, []);

	useEffect(() => {
		if (!isLocalhost) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === ".") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isLocalhost]);

	if (!(mounted && isLocalhost)) {
		return null;
	}

	return (
		<>
			<Button
				className="fixed right-4 bottom-4 z-50 size-10 rounded-full shadow-lg"
				onClick={() => setOpen(true)}
				size="icon"
				variant="outline"
			>
				<BugIcon className="size-5" weight="duotone" />
			</Button>

			<Drawer onOpenChange={setOpen} open={open}>
				<DrawerContent>
					<DrawerHeader className="border-b">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<GearIcon className="size-5" weight="duotone" />
								<DrawerTitle>Dev Tools</DrawerTitle>
							</div>
							<DrawerClose asChild>
								<Button size="icon" variant="ghost">
									<XIcon className="size-4" />
								</Button>
							</DrawerClose>
						</div>
						<DrawerDescription>
							Development settings and quick toggles
						</DrawerDescription>
					</DrawerHeader>

					<div className="overflow-y-auto p-4 pb-8">
						<div className="space-y-6">
							{DEV_SETTINGS.length > 0 ? (
								DEV_SETTINGS.map((setting) => (
									<SettingRenderer key={setting.id} setting={setting} />
								))
							) : (
								<p className="text-center text-muted-foreground text-sm">
									No dev settings configured
								</p>
							)}

							<div className="rounded bg-muted/50 p-3">
								<p className="text-muted-foreground text-xs">
									<span className="font-medium">Tip:</span> Press{" "}
									<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
										⌘
									</kbd>{" "}
									<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
										.
									</kbd>{" "}
									to toggle this drawer
								</p>
							</div>
						</div>
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
}
