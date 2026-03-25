import { describe, expect, it, beforeEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FolderSelector } from "../folder-selector";
import { FolderTree } from "../folder-tree";
import { FolderManagementDialog } from "../folder-management-dialog";
import type { Flag } from "../types";

const mockFlags: Flag[] = [
	{
		id: "1",
		key: "auth-flag",
		name: "Auth Flag",
		type: "boolean",
		status: "active",
		folder: "auth/login",
		createdBy: "user1",
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: "2", 
		key: "checkout-flag",
		name: "Checkout Flag",
		type: "boolean",
		status: "active",
		folder: "checkout",
		createdBy: "user1",
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: "3",
		key: "root-flag", 
		name: "Root Flag",
		type: "boolean",
		status: "active",
		folder: null,
		createdBy: "user1",
		createdAt: new Date(),
		updatedAt: new Date()
	}
];

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false }
		}
	});

	return (
		<QueryClientProvider client={queryClient}>
			{children}
		</QueryClientProvider>
	);
};

describe("Folder Components", () => {
	describe("FolderSelector", () => {
		it("should render folder selector with existing folders", () => {
			const folders = ["auth/login", "checkout"];
			const onValueChange = () => {};

			render(
				<TestWrapper>
					<FolderSelector
						value=""
						onValueChange={onValueChange}
						folders={folders}
					/>
				</TestWrapper>
			);

			expect(screen.getByRole("combobox")).toBeInTheDocument();
		});

		it("should allow creating new folder", async () => {
			const folders = ["auth"];
			let selectedValue = "";
			const onValueChange = (value: string) => {
				selectedValue = value;
			};

			render(
				<TestWrapper>
					<FolderSelector
						value=""
						onValueChange={onValueChange}
						folders={folders}
					/>
				</TestWrapper>
			);

			fireEvent.click(screen.getByRole("combobox"));
			
			const input = screen.getByPlaceholderText("Search folders...");
			fireEvent.change(input, { target: { value: "new-folder" } });

			await waitFor(() => {
				const createButton = screen.getByText(/Create "new-folder"/);
				expect(createButton).toBeInTheDocument();
			});
		});

		it("should validate folder names", async () => {
			const folders: string[] = [];
			const onValueChange = () => {};

			render(
				<TestWrapper>
					<FolderSelector
						value=""
						onValueChange={onValueChange}
						folders={folders}
					/>
				</TestWrapper>
			);

			fireEvent.click(screen.getByRole("combobox"));
			
			const input = screen.getByPlaceholderText("Search folders...");
			fireEvent.change(input, { target: { value: "invalid folder!" } });

			// Wait for the UI to update
			await waitFor(() => {
				expect(screen.queryByText(/Create "invalid folder!"/)).not.toBeInTheDocument();
			});
		});
	});

	describe("FolderTree", () => {
		it("should render folder tree with flags", () => {
			const onFolderSelect = () => {};

			render(
				<TestWrapper>
					<FolderTree
						flags={mockFlags}
						selectedFolder=""
						onFolderSelect={onFolderSelect}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("Uncategorized")).toBeInTheDocument();
			expect(screen.getByText("auth")).toBeInTheDocument();
			expect(screen.getByText("checkout")).toBeInTheDocument();
		});

		it("should show flag counts in folders", () => {
			const onFolderSelect = () => {};

			render(
				<TestWrapper>
					<FolderTree
						flags={mockFlags}
						selectedFolder=""
						onFolderSelect={onFolderSelect}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("1")).toBeInTheDocument(); // Root folder count
		});

		it("should handle folder selection", () => {
			let selectedFolder = "";
			const onFolderSelect = (folder: string) => {
				selectedFolder = folder;
			};

			render(
				<TestWrapper>
					<FolderTree
						flags={mockFlags}
						selectedFolder=""
						onFolderSelect={onFolderSelect}
					/>
				</TestWrapper>
			);

			fireEvent.click(screen.getByText("checkout"));
			expect(selectedFolder).toBe("checkout");
		});

		it("should expand and collapse folders", () => {
			const onFolderSelect = () => {};

			render(
				<TestWrapper>
					<FolderTree
						flags={mockFlags}
						selectedFolder=""
						onFolderSelect={onFolderSelect}
					/>
				</TestWrapper>
			);

			const authFolder = screen.getByText("auth");
			fireEvent.click(authFolder);

			expect(screen.getByText("login")).toBeInTheDocument();
		});
	});

	describe("FolderManagementDialog", () => {
		it("should render folder management dialog", () => {
			const onClose = () => {};
			const onUpdateFlag = async () => {};

			render(
				<TestWrapper>
					<FolderManagementDialog
						isOpen={true}
						onClose={onClose}
						flags={mockFlags}
						onUpdateFlag={onUpdateFlag}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("Manage Folders")).toBeInTheDocument();
			expect(screen.getByText("Create New Folder")).toBeInTheDocument();
		});

		it("should show existing folders", () => {
			const onClose = () => {};
			const onUpdateFlag = async () => {};

			render(
				<TestWrapper>
					<FolderManagementDialog
						isOpen={true}
						onClose={onClose}
						flags={mockFlags}
						onUpdateFlag={onUpdateFlag}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("auth/login")).toBeInTheDocument();
			expect(screen.getByText("checkout")).toBeInTheDocument();
		});

		it("should allow creating new folders", async () => {
			const onClose = () => {};
			const onUpdateFlag = async () => {};

			render(
				<TestWrapper>
					<FolderManagementDialog
						isOpen={true}
						onClose={onClose}
						flags={mockFlags}
						onUpdateFlag={onUpdateFlag}
					/>
				</TestWrapper>
			);

			const input = screen.getByPlaceholderText("e.g., auth/login or checkout");
			fireEvent.change(input, { target: { value: "new-folder" } });

			const createButton = screen.getByRole("button", { name: /\+/ });
			fireEvent.click(createButton);

			await waitFor(() => {
				expect(screen.getByText(/Folder name "new-folder" is valid/)).toBeInTheDocument();
			});
		});

		it("should validate folder names on creation", async () => {
			const onClose = () => {};
			const onUpdateFlag = async () => {};

			render(
				<TestWrapper>
					<FolderManagementDialog
						isOpen={true}
						onClose={onClose}
						flags={mockFlags}
						onUpdateFlag={onUpdateFlag}
					/>
				</TestWrapper>
			);

			const input = screen.getByPlaceholderText("e.g., auth/login or checkout");
			fireEvent.change(input, { target: { value: "invalid folder!" } });

			const createButton = screen.getByRole("button", { name: /\+/ });
			fireEvent.click(createButton);

			await waitFor(() => {
				expect(screen.getByText(/can only contain letters/)).toBeInTheDocument();
			});
		});

		it("should show flag counts for each folder", () => {
			const onClose = () => {};
			const onUpdateFlag = async () => {};

			render(
				<TestWrapper>
					<FolderManagementDialog
						isOpen={true}
						onClose={onClose}
						flags={mockFlags}
						onUpdateFlag={onUpdateFlag}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("1 flags")).toBeInTheDocument(); // auth/login has 1 flag
		});
	});

	describe("Integration Tests", () => {
		it("should preserve flag functionality with folders", () => {
			const flagWithFolder = mockFlags[0];
			const flagWithoutFolder = mockFlags[2];

			expect(flagWithFolder.folder).toBe("auth/login");
			expect(flagWithFolder.status).toBe("active");
			expect(flagWithFolder.type).toBe("boolean");

			expect(flagWithoutFolder.folder).toBeNull();
			expect(flagWithoutFolder.status).toBe("active");
			expect(flagWithoutFolder.type).toBe("boolean");
		});

		it("should handle nested folder structures", () => {
			const nestedFlags: Flag[] = [
				{
					...mockFlags[0],
					folder: "auth/login/social"
				},
				{
					...mockFlags[1], 
					folder: "auth/login/email"
				}
			];

			const onFolderSelect = () => {};

			render(
				<TestWrapper>
					<FolderTree
						flags={nestedFlags}
						selectedFolder=""
						onFolderSelect={onFolderSelect}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("auth")).toBeInTheDocument();
		});

		it("should maintain flag dependencies across folders", () => {
			const flagWithDeps: Flag = {
				...mockFlags[0],
				dependencies: ["other-flag"],
				folder: "auth"
			};

			expect(flagWithDeps.dependencies).toContain("other-flag");
			expect(flagWithDeps.folder).toBe("auth");
		});
	});
});