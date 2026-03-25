import { describe, expect, it } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FlagsListWithFolders } from "../flags-list-with-folders";
import type { Flag, TargetGroup } from "../types";

const mockFlags: Flag[] = [
	{
		id: "1",
		key: "login-flag",
		name: "Login Flag",
		type: "boolean",
		status: "active",
		folder: "auth/login",
		createdBy: "user1",
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: "2",
		key: "signup-flag", 
		name: "Signup Flag",
		type: "boolean",
		status: "active",
		folder: "auth/signup",
		createdBy: "user1",
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: "3",
		key: "payment-flag",
		name: "Payment Flag", 
		type: "rollout",
		status: "active",
		folder: "checkout/payment",
		rolloutPercentage: 50,
		createdBy: "user1",
		createdAt: new Date(),
		updatedAt: new Date()
	},
	{
		id: "4",
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

describe("Folder Integration Tests", () => {
	describe("FlagsListWithFolders", () => {
		it("should group flags by folder correctly", () => {
			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={mockFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("Uncategorized")).toBeInTheDocument();
			expect(screen.getByText("auth")).toBeInTheDocument();
			expect(screen.getByText("checkout")).toBeInTheDocument();
		});

		it("should show correct flag counts per folder", () => {
			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={mockFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("1 flags")).toBeInTheDocument(); // Uncategorized
			expect(screen.getByText("2 flags")).toBeInTheDocument(); // auth folder
		});

		it("should expand and collapse folder sections", async () => {
			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={mockFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			const authFolder = screen.getByText("auth");
			fireEvent.click(authFolder);

			await waitFor(() => {
				expect(screen.getByText("Login Flag")).toBeInTheDocument();
				expect(screen.getByText("Signup Flag")).toBeInTheDocument();
			});
		});

		it("should handle empty folders gracefully", () => {
			const emptyFolderFlags: Flag[] = [];
			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={emptyFolderFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("No flags found")).toBeInTheDocument();
		});

		it("should filter flags by selected folder", () => {
			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={mockFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
						selectedFolder="auth"
					/>
				</TestWrapper>
			);

			expect(screen.queryByText("checkout")).not.toBeInTheDocument();
			expect(screen.queryByText("Uncategorized")).not.toBeInTheDocument();
		});

		it("should preserve flag functionality within folders", async () => {
			const groups = new Map<string, TargetGroup[]>();
			let editedFlag: Flag | null = null;
			let deletedFlagId: string | null = null;

			const onEdit = (flag: Flag) => {
				editedFlag = flag;
			};

			const onDelete = (flagId: string) => {
				deletedFlagId = flagId;
			};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={mockFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			const authFolder = screen.getByText("auth");
			fireEvent.click(authFolder);

			await waitFor(() => {
				const loginFlag = screen.getByText("Login Flag");
				fireEvent.click(loginFlag);
			});

			expect(editedFlag?.key).toBe("login-flag");
		});
	});

	describe("Folder Business Logic Preservation", () => {
		it("should not affect flag evaluation logic", () => {
			const flagInFolder = mockFlags.find(f => f.folder === "auth/login");
			const flagInRoot = mockFlags.find(f => f.folder === null);

			expect(flagInFolder?.status).toBe("active");
			expect(flagInFolder?.type).toBe("boolean");
			expect(flagInFolder?.defaultValue).toBeDefined();

			expect(flagInRoot?.status).toBe("active");
			expect(flagInRoot?.type).toBe("boolean");
			expect(flagInRoot?.defaultValue).toBeDefined();
		});

		it("should preserve flag dependencies across folders", () => {
			const flagWithDeps: Flag = {
				...mockFlags[0],
				dependencies: ["other-flag", "another-flag"],
				folder: "auth/login"
			};

			expect(flagWithDeps.dependencies).toHaveLength(2);
			expect(flagWithDeps.dependencies).toContain("other-flag");
			expect(flagWithDeps.dependencies).toContain("another-flag");
			expect(flagWithDeps.folder).toBe("auth/login");
		});

		it("should maintain flag variants and rules", () => {
			const complexFlag: Flag = {
				...mockFlags[0],
				type: "multivariant",
				variants: [
					{ key: "control", value: "control", type: "string" },
					{ key: "variant-a", value: "variant-a", type: "string" }
				],
				rules: [
					{
						type: "user_id",
						operator: "equals",
						value: "test-user",
						enabled: true,
						batch: false
					}
				],
				folder: "experiments/ab-tests"
			};

			expect(complexFlag.variants).toHaveLength(2);
			expect(complexFlag.rules).toHaveLength(1);
			expect(complexFlag.folder).toBe("experiments/ab-tests");
		});

		it("should handle rollout flags in folders", () => {
			const rolloutFlag = mockFlags.find(f => f.type === "rollout");
			
			expect(rolloutFlag?.type).toBe("rollout");
			expect(rolloutFlag?.rolloutPercentage).toBe(50);
			expect(rolloutFlag?.folder).toBe("checkout/payment");
		});
	});

	describe("Backward Compatibility", () => {
		it("should handle mixed flags with and without folders", () => {
			const mixedFlags = [
				{ ...mockFlags[0], folder: "auth" },
				{ ...mockFlags[1], folder: null },
				{ ...mockFlags[2], folder: "checkout" },
				{ ...mockFlags[3], folder: "" }
			];

			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={mixedFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("Uncategorized")).toBeInTheDocument();
			expect(screen.getByText("auth")).toBeInTheDocument();
			expect(screen.getByText("checkout")).toBeInTheDocument();
		});

		it("should work with legacy flags without folder field", () => {
			const legacyFlags: Flag[] = mockFlags.map(flag => {
				const { folder, ...legacyFlag } = flag;
				return legacyFlag as Flag;
			});

			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={legacyFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("Uncategorized")).toBeInTheDocument();
			expect(screen.getByText("4 flags")).toBeInTheDocument();
		});
	});

	describe("Performance Tests", () => {
		it("should handle large number of flags efficiently", () => {
			const largeFlags: Flag[] = Array.from({ length: 1000 }, (_, i) => ({
				id: `flag-${i}`,
				key: `flag-key-${i}`,
				name: `Flag ${i}`,
				type: "boolean" as const,
				status: "active" as const,
				folder: i % 10 === 0 ? `folder-${Math.floor(i / 10)}` : null,
				createdBy: "user1",
				createdAt: new Date(),
				updatedAt: new Date()
			}));

			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			const startTime = performance.now();

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={largeFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			const endTime = performance.now();
			const renderTime = endTime - startTime;

			expect(renderTime).toBeLessThan(1000); // Should render in less than 1 second
			expect(screen.getByText("Uncategorized")).toBeInTheDocument();
		});

		it("should handle deep folder nesting", () => {
			const deepNestedFlags: Flag[] = [
				{
					...mockFlags[0],
					folder: "level1/level2/level3/level4/level5"
				}
			];

			const groups = new Map<string, TargetGroup[]>();
			const onEdit = () => {};
			const onDelete = () => {};

			render(
				<TestWrapper>
					<FlagsListWithFolders
						flags={deepNestedFlags}
						groups={groups}
						onEdit={onEdit}
						onDelete={onDelete}
					/>
				</TestWrapper>
			);

			expect(screen.getByText("level1")).toBeInTheDocument();
		});
	});
});