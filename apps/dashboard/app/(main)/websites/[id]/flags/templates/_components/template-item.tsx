"use client";

import type { FlagTemplate } from "../../_components/types";
import {
	ArrowRightIcon,
	RocketLaunchIcon,
	TestTubeIcon,
	UsersIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card } from "@databuddy/ui";

export interface TemplateItemProps {
	onUseAction: (template: FlagTemplate) => void;
	template: FlagTemplate;
}

function getTemplateIcon(icon: string) {
	switch (icon) {
		case "rocket":
			return RocketLaunchIcon;
		case "test":
			return TestTubeIcon;
		case "users":
			return UsersIcon;
		case "warning":
			return WarningIcon;
		default:
			return RocketLaunchIcon;
	}
}

function getCategoryColor(
	category: string
): "default" | "warning" | "success" | "destructive" | "muted" {
	switch (category) {
		case "rollout":
			return "default";
		case "experiment":
			return "warning";
		case "targeting":
			return "success";
		case "killswitch":
			return "destructive";
		default:
			return "muted";
	}
}

export function TemplateItem({ template, onUseAction }: TemplateItemProps) {
	const TemplateIcon = getTemplateIcon(template.icon);
	const categoryColor = getCategoryColor(template.category);

	return (
		<Card className="group relative flex flex-col overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
			<Card.Header className="space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex size-10 shrink-0 items-center justify-center rounded bg-primary/10">
						<TemplateIcon className="size-5 text-primary" />
					</div>
					{template.isBuiltIn && (
						<Badge className="shrink-0" variant="default">
							Built-in
						</Badge>
					)}
				</div>
				<Card.Title className="line-clamp-1 text-lg">
					{template.name}
				</Card.Title>
			</Card.Header>
			<Card.Content className="flex-1 space-y-3">
				<Card.Description className="line-clamp-2 text-sm">
					{template.description}
				</Card.Description>
				<div className="flex items-center gap-2">
					<Badge variant={categoryColor}>{template.category}</Badge>
					<Badge variant="default">{template.type}</Badge>
				</div>
			</Card.Content>
			<Card.Footer>
				<Button
					className="w-full gap-2"
					onClick={() => onUseAction(template)}
					size="sm"
				>
					Use Template
					<ArrowRightIcon className="size-4" />
				</Button>
			</Card.Footer>
		</Card>
	);
}
