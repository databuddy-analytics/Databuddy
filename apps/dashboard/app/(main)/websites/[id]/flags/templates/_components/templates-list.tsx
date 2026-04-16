"use client";

import { LayoutIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import type { TemplatesListProps } from "../../_components/types";
import { TemplateItem } from "./template-item";

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
					description="Pre-configured templates for common feature flag patterns will appear here."
					icon={<LayoutIcon weight="duotone" />}
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
