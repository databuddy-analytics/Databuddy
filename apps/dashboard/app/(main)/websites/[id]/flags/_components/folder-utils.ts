export interface FolderNode {
	id: string;
	name: string;
	path: string;
	children: FolderNode[];
	isExpanded?: boolean;
	flagCount: number;
}

export interface FlagWithFolder {
	id: string;
	folder?: string | null;
	[key: string]: unknown;
}

/**
 * Build a folder tree from flags with folder paths
 */
export function buildFolderTree(flags: FlagWithFolder[]): FolderNode[] {
	const folderMap = new Map<string, FolderNode>();
	const rootFolders: FolderNode[] = [];

	// Initialize root (no folder)
	const rootNode: FolderNode = {
		id: "",
		name: "Root",
		path: "",
		children: [],
		flagCount: 0,
	};

	// Count flags in each folder
	const folderCounts = new Map<string, number>();
	folderCounts.set("", 0); // Root folder

	for (const flag of flags) {
		const folderPath = flag.folder || "";
		folderCounts.set(folderPath, (folderCounts.get(folderPath) || 0) + 1);

		if (folderPath) {
			// Split path and ensure all parent folders exist
			const parts = folderPath.split("/").filter(Boolean);
			let currentPath = "";

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const parentPath = currentPath;
				currentPath = currentPath ? `${currentPath}/${part}` : part;

				if (!folderCounts.has(currentPath)) {
					folderCounts.set(currentPath, 0);
				}
			}
		}
	}

	// Create folder nodes
	for (const [path, count] of folderCounts.entries()) {
		if (path === "") {
			rootNode.flagCount = count;
			continue;
		}

		const parts = path.split("/").filter(Boolean);
		const name = parts[parts.length - 1];
		const parentPath = parts.slice(0, -1).join("/");

		const node: FolderNode = {
			id: path,
			name,
			path,
			children: [],
			flagCount: count,
		};

		folderMap.set(path, node);

		if (parentPath === "") {
			rootFolders.push(node);
		} else {
			const parent = folderMap.get(parentPath);
			if (parent) {
				parent.children.push(node);
			}
		}
	}

	// Sort children by name
	function sortChildren(nodes: FolderNode[]) {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const node of nodes) {
			sortChildren(node.children);
		}
	}

	sortChildren(rootFolders);

	return [rootNode, ...rootFolders];
}

/**
 * Get all folder paths from the tree
 */
export function getAllFolderPaths(tree: FolderNode[]): string[] {
	const paths: string[] = [];

	function traverse(nodes: FolderNode[]) {
		for (const node of nodes) {
			paths.push(node.path);
			traverse(node.children);
		}
	}

	traverse(tree);
	return paths;
}

/**
 * Get a folder node by path
 */
export function getFolderByPath(
	tree: FolderNode[],
	path: string
): FolderNode | null {
	function search(nodes: FolderNode[]): FolderNode | null {
		for (const node of nodes) {
			if (node.path === path) return node;
			const found = search(node.children);
			if (found) return found;
		}
		return null;
	}

	return search(tree);
}

/**
 * Validate folder path (no special characters, proper format)
 */
export function isValidFolderPath(path: string): boolean {
	if (!path) return true; // Empty path is valid (root)

	// Check for invalid characters
	const invalidChars = /[<>:"|?*\\]/;
	if (invalidChars.test(path)) return false;

	// Check for reserved names
	const reservedNames = ["CON", "PRN", "AUX", "NUL"];
	const parts = path.split("/");
	for (const part of parts) {
		if (reservedNames.includes(part.toUpperCase())) return false;
		if (part.trim() !== part) return false; // No leading/trailing spaces
		if (part.includes("..")) return false; // No parent directory references
	}

	return true;
}

/**
 * Generate a unique folder path when creating a new folder
 */
export function generateUniqueFolderPath(
	baseName: string,
	parentPath: string,
	existingPaths: string[]
): string {
	const fullBasePath = parentPath ? `${parentPath}/${baseName}` : baseName;

	if (!existingPaths.includes(fullBasePath)) {
		return fullBasePath;
	}

	let counter = 1;
	while (true) {
		const candidate = parentPath
			? `${parentPath}/${baseName} (${counter})`
			: `${baseName} (${counter})`;
		if (!existingPaths.includes(candidate)) {
			return candidate;
		}
		counter++;
	}
}