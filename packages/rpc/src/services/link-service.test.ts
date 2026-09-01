import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

import { normalizeNullableText, normalizeTargetDomain } from "./link-service";

// — pure helpers (no mocks needed) —
describe("normalizeNullableText", () => {
	it("trims and nulls empty strings", () => {
		expect(normalizeNullableText(null)).toBeNull();
		expect(normalizeNullableText(undefined)).toBeNull();
		expect(normalizeNullableText("")).toBeNull();
		expect(normalizeNullableText("   ")).toBeNull();
		expect(normalizeNullableText("  hello ")).toBe("hello");
		expect(normalizeNullableText("a")).toBe("a");
	});
});

describe("normalizeTargetDomain", () => {
	it("extracts hostname and lowercases", () => {
		expect(normalizeTargetDomain("https://Example.COM/path")).toBe(
			"example.com"
		);
		expect(normalizeTargetDomain("example.com")).toBe("example.com");
		expect(normalizeTargetDomain("  WWW.example.com/ ")).toBe(
			"www.example.com"
		);
		expect(normalizeTargetDomain(null)).toBeNull();
		expect(normalizeTargetDomain("   ")).toBeNull();
		expect(normalizeTargetDomain("not a url /")).toBe("not a url ");
	});
});

// — LinkService with mocked Redis + fake DB —
// Redis is imported directly by the service, so mock the module before importing the service.
const mockBegin = mock(async () => ({ state: "acquired", token: "tok-1" }));
const mockFinish = mock(async () => true);
const mockAbandon = mock(async () => true);
const mockSetIfAbsent = mock(async () => true);
const mockInvalidate = mock(async () => undefined);
const mockLoggerError = mock(() => undefined);
const mockLoggerWarn = mock(() => undefined);

mock.module("@databuddy/redis", () => ({
	abandonCachedLinkMutation: mockAbandon,
	beginCachedLinkMutation: mockBegin,
	finishCachedLinkMutation: mockFinish,
	invalidateAgentContextSnapshotsForOwner: mockInvalidate,
	setCachedLinkIfAbsent: mockSetIfAbsent,
}));

mock.module("../lib/logger", () => ({
	logger: {
		error: mockLoggerError,
		warn: mockLoggerWarn,
		info: mock(() => undefined),
	},
}));

const { LinkService } = await import("./link-service");

afterAll(() => {
	mock.restore();
});

type FakeLink = {
	id: string;
	slug: string;
	organizationId: string;
	targetUrl: string;
	targetDomain: string | null;
	name: string;
	folderId: string | null;
	deepLinkApp: string | null;
	expiresAt: Date | null;
	deletedAt: null;
	createdAt: Date;
	updatedAt: Date;
};

function makeFakeDb(opts: {
	folderExists?: boolean;
	insertImpl?: (values: Record<string, unknown>) => Promise<FakeLink[]>;
	selectImpl?: () => Promise<FakeLink[]>;
	updateImpl?: () => Promise<FakeLink[]>;
	deleteImpl?: () => Promise<{ id: string }[]>;
} = {}) {
	const folderExists = opts.folderExists ?? true;
	const links = new Map<string, FakeLink>();

	return {
		links,
		db: {
			select: (..._args: unknown[]) => ({
				from: (..._f: unknown[]) => ({
					where: (..._w: unknown[]) => ({
						limit: async (n: number) => {
							if (opts.selectImpl) return opts.selectImpl();
							// folder check path — called with { id: linkFolders.id }
							// distinguish by checking if we are in folder validation context:
							// the service checks folder existence: return 1 row if folderExists
							// heuristic: if select was called with { id: ... } shape, treat as folder
							// we track via a flag — for simplicity return folder row when folderExists
							// and not handling link reconciliation here
							// To differentiate link reconciliation (select by id), we check mock state
							// For now, if opts.selectImpl not provided, assume folder check
							return folderExists ? [{ id: "folder-1" }].slice(0, n) : [];
						},
					}),
				}),
			}),
			insert: (..._a: unknown[]) => ({
				values: (values: Record<string, unknown>) => ({
					returning: async () => {
						if (opts.insertImpl) return opts.insertImpl(values);
						const row: FakeLink = {
							id: values.id as string,
							slug: values.slug as string,
							organizationId: values.organizationId as string,
							targetUrl: values.targetUrl as string,
							targetDomain: (values.targetDomain as string | null) ?? null,
							name: values.name as string,
							folderId: (values.folderId as string | null) ?? null,
							deepLinkApp: (values.deepLinkApp as string | null) ?? null,
							expiresAt: (values.expiresAt as Date | null) ?? null,
							deletedAt: null,
							createdAt: new Date(),
							updatedAt: new Date(),
						};
						links.set(row.id, row);
						return [row];
					},
				}),
			}),
			update: (..._a: unknown[]) => ({
				set: (..._s: unknown[]) => ({
					where: (..._w: unknown[]) => ({
						returning: async () => {
							if (opts.updateImpl) return opts.updateImpl();
							return [];
						},
					}),
				}),
			}),
			delete: (..._a: unknown[]) => ({
				where: (..._w: unknown[]) => ({
					returning: async () => {
						if (opts.deleteImpl) return opts.deleteImpl();
						return [];
					},
				}),
			}),
		} as unknown as ConstructorParameters<typeof LinkService>[0]["db"],
	};
}

beforeEach(() => {
	mockBegin.mockClear();
	mockFinish.mockClear();
	mockAbandon.mockClear();
	mockSetIfAbsent.mockClear();
	mockInvalidate.mockClear();
	mockLoggerError.mockClear();
	mockLoggerWarn.mockClear();
	mockBegin.mockImplementation(async () => ({ state: "acquired", token: "tok-1" }));
	mockFinish.mockImplementation(async () => true);
	mockAbandon.mockImplementation(async () => true);
	mockSetIfAbsent.mockImplementation(async () => true);
	mockInvalidate.mockImplementation(async () => undefined);
});

describe("LinkService", () => {
	it("rejects deep-link mismatches before touching DB", async () => {
		const { db } = makeFakeDb();
		const svc = new LinkService({ db });

		await expect(
			svc.create({
				organizationId: "org-1",
				createdBy: "user-1",
				name: "Bad Deep",
				targetUrl: "https://example.com/page",
				deepLinkApp: "instagram",
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(mockBegin).not.toHaveBeenCalled();
	});

	it("rejects unknown folder", async () => {
		const { db } = makeFakeDb({ folderExists: false });
		const svc = new LinkService({ db });

		await expect(
			svc.create({
				organizationId: "org-1",
				createdBy: "user-1",
				name: "With Folder",
				targetUrl: "https://example.com",
				folderId: "missing-folder",
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("creates with custom slug via cache lease", async () => {
		const { db, links } = makeFakeDb();
		const svc = new LinkService({ db });

		const link = await svc.create({
			organizationId: "org-1",
			createdBy: "user-1",
			name: "My Link",
			targetUrl: "https://example.com/a",
			slug: "my-slug",
		});

		expect(link.slug).toBe("my-slug");
		expect(links.size).toBe(1);
		expect(mockBegin).toHaveBeenCalledTimes(1);
		expect(mockBegin.mock.calls[0]?.[0]).toBe("my-slug");
	});

	it("throws conflict when cache lease is busy for custom slug", async () => {
		mockBegin.mockImplementationOnce(async () => ({ state: "busy" }));
		const { db } = makeFakeDb();
		const svc = new LinkService({ db });

		await expect(
			svc.create({
				organizationId: "org-1",
				createdBy: "user-1",
				name: "My Link",
				targetUrl: "https://example.com",
				slug: "taken-slug",
			})
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("throws serviceUnavailable when cache is temporarily unavailable", async () => {
		mockBegin.mockImplementationOnce(async () => {
			throw new Error("redis down");
		});
		const { db } = makeFakeDb();
		const svc = new LinkService({ db });

		await expect(
			svc.create({
				organizationId: "org-1",
				createdBy: "user-1",
				name: "My Link",
				targetUrl: "https://example.com",
				slug: "any-slug",
			})
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
	});

	it("retries generated slugs on PG unique violation", async () => {
		let call = 0;
		const { db } = makeFakeDb({
			insertImpl: async (values) => {
				call += 1;
				if (call === 1) {
					throw Object.assign(new Error("duplicate"), {
						code: "23505",
						constraint: "links_slug_unique",
						severity: "ERROR",
					});
				}
				return [
					{
						id: values.id as string,
						slug: values.slug as string,
						organizationId: values.organizationId as string,
						targetUrl: values.targetUrl as string,
						targetDomain: null,
						name: values.name as string,
						folderId: null,
						deepLinkApp: null,
						expiresAt: null,
						deletedAt: null,
						createdAt: new Date(),
						updatedAt: new Date(),
					} as FakeLink,
				];
			},
		});
		const svc = new LinkService({ db });

		const link = await svc.create({
			organizationId: "org-1",
			createdBy: "user-1",
			name: "Generated",
			targetUrl: "https://example.com",
		});

		expect(link.slug).toBeDefined();
		expect(call).toBe(2);
		expect(mockBegin).not.toHaveBeenCalled();
	});

	it("publishes via backfill when generated slug skips lease", async () => {
		const { db } = makeFakeDb();
		const svc = new LinkService({ db });

		await svc.create({
			organizationId: "org-1",
			createdBy: "user-1",
			name: "Gen",
			targetUrl: "https://example.com",
		});

		// wait a tick for fire-and-forget backfill
		await new Promise((r) => setTimeout(r, 10));
		expect(mockSetIfAbsent).toHaveBeenCalledTimes(1);
		expect(mockFinish).not.toHaveBeenCalled();
	});
});
