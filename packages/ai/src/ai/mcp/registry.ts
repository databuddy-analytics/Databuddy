import type {
	McpToolFactory,
	McpToolMetadata,
	McpToolSurface,
} from "./define-tool";

export interface ToolCatalogItem {
	access: McpToolMetadata["access"];
	capability: McpToolMetadata["capability"];
	description: string;
	name: string;
	surfaces: NonNullable<McpToolMetadata["surfaces"]>;
}

export interface ToolRegistry {
	catalog: readonly ToolCatalogItem[];
	factories: readonly McpToolFactory[];
	names: readonly string[];
}

export function createToolRegistry(
	factories: readonly McpToolFactory[]
): ToolRegistry {
	const names = factories.map((factory, index) => {
		if (!factory.toolName) {
			throw new Error(
				`MCP tool factory at index ${index} is missing a toolName. Check defineMcpTool usage.`
			);
		}
		return factory.toolName;
	});

	return Object.freeze({
		catalog: Object.freeze(
			factories.map((factory) => {
				const surfaces: McpToolSurface[] = factory.metadata.surfaces
					? [...factory.metadata.surfaces]
					: ["mcp", "agent"];
				return Object.freeze({
					access: factory.metadata.access,
					capability: factory.metadata.capability,
					description: factory.description,
					name: factory.toolName,
					surfaces,
				});
			})
		),
		factories: Object.freeze([...factories]),
		names: Object.freeze(names),
	});
}
