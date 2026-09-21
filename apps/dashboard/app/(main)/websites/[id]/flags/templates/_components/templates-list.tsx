"use client";

import type { TemplatesListProps } from "../../_components/types";
import { TemplateItem } from "./template-item";
import { LayoutIcon } from "@databuddy/ui/icons";
import { EmptyState } from "@databuddy/ui";

export function TemplatesList({
	templates,
	isLoading,
	onUseTemplateAction,
}: TemplatesListProps) {
	if (isLoading) {
		return null;
	}

	if (templates.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					description="Ready-made flag setups will appear here."
					icon={<LayoutIcon />}
					title="No templates available"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
			{templates.map((template) => (
				<TemplateItem
					key={template.id}
					onUseAction={onUseTemplateAction}
					template={template}
				/>
			))}
		</div>
	);
}
