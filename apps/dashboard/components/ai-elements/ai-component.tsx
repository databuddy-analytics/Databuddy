"use client";

import {
	getComponent,
	hasComponent,
	type RawComponentInput,
} from "@/lib/ai-components";

interface AIComponentProps {
	input: RawComponentInput;
	className?: string;
}

/**
 * Renders an AI-generated component based on its type.
 * Looks up the component definition in the registry and renders it.
 */
export function AIComponent({ input, className }: AIComponentProps) {
	if (!hasComponent(input.type)) {
		return null;
	}

	const definition = getComponent(input.type);
	if (!definition) {
		return null;
	}

	if (!definition.validate(input)) {
		return null;
	}

	const props = definition.transform(input);
	const Component = definition.component;

	return <Component {...props} className={className} />;
}
