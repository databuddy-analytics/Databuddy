"use client";

import type {
	BusinessContextSettings,
	BusinessMeasurementPlan,
} from "@databuddy/shared/organization-business-context";
import { Button, Card, Field, Input } from "@databuddy/ui";
import { Accordion, DropdownMenu } from "@databuddy/ui/client";
import { CaretDownIcon } from "@databuddy/ui/icons";
import { useState } from "react";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { useAutocompleteData } from "@/hooks/use-autocomplete";

interface MeasurementPlanEditorProps {
	disabled: boolean;
	onChange: (plans: BusinessMeasurementPlan[]) => void;
	plans: BusinessMeasurementPlan[];
	websites: BusinessContextSettings["websites"];
}

const eventFields = [
	{ key: "activationEvent", label: "Activation event" },
	{ key: "returnEvent", label: "Return event" },
] as const;

export function MeasurementPlanEditor({
	websites,
	plans,
	disabled,
	onChange,
}: MeasurementPlanEditorProps) {
	const [websiteId, setWebsiteId] = useState("");
	const website = websites.find((site) => site.id === websiteId) ?? websites[0];
	const plan = plans.find((item) => item.websiteId === website?.id);
	const catalog = useAutocompleteData(website?.id ?? "", !disabled && !!plan);
	const events = catalog.data?.customEvents ?? [];
	const domainMismatch = plan && website && plan.domain !== website.domain;
	const update = (
		changes: Partial<Omit<BusinessMeasurementPlan, "websiteId">>
	) => {
		if (disabled || !plan) {
			return;
		}
		onChange(
			plans.map((item) =>
				item.websiteId === plan.websiteId ? { ...item, ...changes } : item
			)
		);
	};
	const toggleDefinition = () => {
		if (disabled || !website) {
			return;
		}
		onChange(
			plan
				? plans.filter((item) => item.websiteId !== website.id)
				: [
						...plans,
						{
							websiteId: website.id,
							domain: website.domain,
							name: "",
							activationEvent: "",
							returnEvent: "",
							horizonDays: 7,
						},
					]
		);
	};

	return (
		<Card>
			<Card.Header>
				<Card.Title>Activation and return</Card.Title>
				<Card.Description>
					Choose the events that mean someone got value and came back. Saved
					definitions guide automatic investigations. Only identified profiles
					can be measured.
				</Card.Description>
			</Card.Header>
			<Card.Content className="space-y-4">
				{plans
					.filter(
						(item) => !websites.some((site) => site.id === item.websiteId)
					)
					.map((item) => (
						<div
							className="flex items-center justify-between gap-2 text-xs"
							key={item.websiteId}
						>
							<p className="text-muted-foreground">
								{item.name || item.domain}: website unavailable. This definition
								is inactive.
							</p>
							{!disabled && (
								<Button
									size="sm"
									variant="ghost"
									onClick={() =>
										onChange(
											plans.filter(
												(candidate) => candidate.websiteId !== item.websiteId
											)
										)
									}
								>
									Remove
								</Button>
							)}
						</div>
					))}
				{disabled ? (
					plans.length ? (
						plans.map((item) => {
							const site = websites.find(
								(candidate) => candidate.id === item.websiteId
							);
							return (
								<div
									className="space-y-2 break-words text-xs"
									key={item.websiteId}
								>
									<p className="font-medium">
										{item.name || "Unnamed outcome"}
									</p>
									<p className="text-muted-foreground">{item.domain}</p>
									{site && site.domain !== item.domain && (
										<p className="text-destructive">
											Website domain changed to {site.domain}. This definition
											is inactive until updated.
										</p>
									)}
									<p>
										Activation: <code>{item.activationEvent || "Not set"}</code>
									</p>
									<p>
										Return: <code>{item.returnEvent || "Not set"}</code> within{" "}
										{item.horizonDays} days
									</p>
									{item.namespace && (
										<p>
											Namespace: <code>{item.namespace}</code>
										</p>
									)}
								</div>
							);
						})
					) : (
						<p className="text-muted-foreground text-xs">
							No definitions configured.
						</p>
					)
				) : website ? (
					<>
						<div className="flex flex-wrap items-center justify-between gap-2">
							{websites.length > 1 ? (
								<DropdownMenu>
									<DropdownMenu.Trigger
										aria-label={`Website: ${website.domain}`}
										render={
											<Button
												className="max-w-full"
												size="sm"
												variant="secondary"
											/>
										}
									>
										<span className="truncate">{website.domain}</span>
										<CaretDownIcon className="size-3 shrink-0" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start">
										<DropdownMenu.RadioGroup
											onValueChange={setWebsiteId}
											value={website.id}
										>
											{websites.map((site) => (
												<DropdownMenu.RadioItem key={site.id} value={site.id}>
													{site.domain}
												</DropdownMenu.RadioItem>
											))}
										</DropdownMenu.RadioGroup>
									</DropdownMenu.Content>
								</DropdownMenu>
							) : (
								<p className="break-all text-muted-foreground text-xs">
									{website.domain}
								</p>
							)}
							<Button
								aria-label={`${plan ? "Remove" : "Add"} definition for ${website.domain}`}
								disabled={!plan && plans.length >= 20}
								onClick={toggleDefinition}
								size="sm"
								variant={plan ? "ghost" : "secondary"}
							>
								{plan ? "Remove" : "Add definition"}
							</Button>
						</div>
						{plan ? (
							<div className="space-y-4" key={website.id}>
								{domainMismatch && (
									<div className="space-y-2" role="alert">
										<p className="break-words text-destructive text-xs">
											This definition is bound to {plan.domain}. Update it to{" "}
											{website.domain} before saving.
										</p>
										<Button
											onClick={() => update({ domain: website.domain })}
											size="sm"
											variant="secondary"
										>
											Use current website
										</Button>
									</div>
								)}
								<Field>
									<Field.Label>Business outcome</Field.Label>
									<Input
										maxLength={120}
										onChange={(event) => update({ name: event.target.value })}
										placeholder="Name this outcome for your team"
										value={plan.name}
									/>
								</Field>
								<div className="grid gap-4 sm:grid-cols-2">
									{eventFields.map(({ key, label }) => (
										<Field className="min-w-0" key={key}>
											<Field.Label>{label}</Field.Label>
											<AutocompleteInput
												inputClassName="font-mono"
												onValueChange={(value) => update({ [key]: value })}
												placeholder="Exact event name"
												suggestions={events}
												value={plan[key]}
											/>
											<Field.Description>
												{catalog.isError
													? "Catalog unavailable; enter an exact name."
													: catalog.isPending
														? "Loading event names; you can keep typing."
														: plan[key]
															? events.includes(plan[key])
																? "Seen in the recent event catalog."
																: "Not seen recently. Check that this event is recorded."
															: "Choose a recent event or type an exact name."}
											</Field.Description>
										</Field>
									))}
								</div>
								<DropdownMenu>
									<DropdownMenu.Trigger
										aria-label={`Return window: ${plan.horizonDays} days`}
										render={<Button size="sm" variant="secondary" />}
									>
										Return within {plan.horizonDays} days
										<CaretDownIcon className="size-3 shrink-0" />
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="start">
										<DropdownMenu.RadioGroup
											onValueChange={(value) =>
												update({ horizonDays: value === "30" ? 30 : 7 })
											}
											value={String(plan.horizonDays)}
										>
											<DropdownMenu.RadioItem value="7">
												7 days
											</DropdownMenu.RadioItem>
											<DropdownMenu.RadioItem value="30">
												30 days
											</DropdownMenu.RadioItem>
										</DropdownMenu.RadioGroup>
									</DropdownMenu.Content>
								</DropdownMenu>
								<Accordion defaultOpen={!!plan.namespace}>
									<Accordion.Trigger>
										Advanced{plan.namespace ? " · Namespace set" : ""}
									</Accordion.Trigger>
									<Accordion.Content>
										<Field>
											<Field.Label>Namespace (optional)</Field.Label>
											<Input
												autoCapitalize="none"
												maxLength={256}
												onChange={(event) =>
													update({ namespace: event.target.value || undefined })
												}
												placeholder="Exact namespace"
												spellCheck={false}
												value={plan.namespace ?? ""}
											/>
										</Field>
									</Accordion.Content>
								</Accordion>
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								{plans.length >= 20
									? "Up to 20 website definitions are supported."
									: "No definition for this website. Add one to choose the outcome and events."}
							</p>
						)}
					</>
				) : (
					<p className="text-muted-foreground text-xs">
						Add a website to define activation and return.
					</p>
				)}
			</Card.Content>
		</Card>
	);
}
