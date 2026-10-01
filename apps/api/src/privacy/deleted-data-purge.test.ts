import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredDataOwner } from "@databuddy/db/clickhouse";

const state = vi.hoisted(() => ({
	storedOwners: [] as StoredDataOwner[],
	storedLinks: [] as StoredDataOwner[],
	existingIds: [] as string[],
	purgeOwners: vi.fn(async (_ids: string[]) => undefined),
	purgeLinks: vi.fn(async (_ids: string[]) => undefined),
	audit: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
}));

vi.mock("@databuddy/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: async () => state.existingIds.map((id) => ({ id })),
			}),
		}),
	},
	sql: Object.assign(() => undefined, { param: (value: string[]) => value }),
}));
vi.mock("@databuddy/db/clickhouse", () => ({
	listOwnersWithStoredData: async () => state.storedOwners,
	listLinksWithStoredVisits: async () => state.storedLinks,
	purgeAnalyticsData: state.purgeOwners,
	purgeLinkVisits: state.purgeLinks,
}));
vi.mock("@databuddy/db/schema", () => ({
	websites: { id: "website-id" },
	organization: { id: "organization-id" },
	user: { id: "user-id" },
	links: { id: "link-id" },
}));
vi.mock("@databuddy/redis", () => ({ redis: { set: async () => "OK" } }));
vi.mock("@databuddy/shared/evlog-fields", () => ({
	getErrorLogFields: (error: Error) => ({ error_message: error.message }),
}));
vi.mock("evlog", () => ({
	audit: state.audit,
	log: { error: state.error, warn: state.warn },
}));

import { startDeletedDataPurgeLoop } from "./deleted-data-purge";

beforeEach(() => {
	vi.clearAllMocks();
	state.storedOwners = [];
	state.storedLinks = [];
	state.existingIds = [];
});

function owners(total: number): StoredDataOwner[] {
	return Array.from({ length: total }, (_, index) => ({
		id: `owner-${index}`,
		recent: 0,
	}));
}

async function run() {
	await startDeletedDataPurgeLoop().stop();
}

describe("deleted-data purge safety", () => {
	it.each([1, 10, 11])("refuses all %i missing owners", async (count) => {
		state.storedOwners = owners(count);
		await run();
		expect(state.purgeOwners).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
		expect(state.error).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "owner" })
		);
	});

	it.each([1, 10, 11])("refuses all %i missing links", async (count) => {
		state.storedLinks = owners(count);
		await run();
		expect(state.purgeLinks).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
		expect(state.error).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "link" })
		);
	});

	it("purges one of two owners and leaves the existing owner intact", async () => {
		state.storedOwners = owners(2);
		state.existingIds = ["owner-1"];
		await run();
		expect(state.purgeOwners).toHaveBeenCalledExactlyOnceWith(["owner-0"]);
		expect(state.audit).toHaveBeenCalledWith(
			expect.objectContaining({ target: { type: "owner", id: "owner-0" } })
		);
		expect(state.error).not.toHaveBeenCalled();
	});

	it("purges one of two links and leaves the existing link intact", async () => {
		state.storedLinks = owners(2);
		state.existingIds = ["owner-1"];
		await run();
		expect(state.purgeLinks).toHaveBeenCalledExactlyOnceWith(["owner-0"]);
		expect(state.audit).toHaveBeenCalledWith(
			expect.objectContaining({ target: { type: "link", id: "owner-0" } })
		);
		expect(state.error).not.toHaveBeenCalled();
	});

	it("refuses ten missing owners when only one owner still exists", async () => {
		state.storedOwners = owners(11);
		state.existingIds = ["owner-10"];
		await run();
		expect(state.purgeOwners).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
		expect(state.error).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "owner" })
		);
	});

	it("allows eleven missing owners at exactly 25 percent", async () => {
		state.storedOwners = owners(44);
		state.existingIds = state.storedOwners.slice(11).map(({ id }) => id);
		await run();
		expect(state.purgeOwners).toHaveBeenCalledExactlyOnceWith(
			state.storedOwners.slice(0, 11).map(({ id }) => id)
		);
		expect(state.error).not.toHaveBeenCalled();
	});

	it("refuses eleven missing owners above 25 percent", async () => {
		state.storedOwners = owners(43);
		state.existingIds = state.storedOwners.slice(11).map(({ id }) => id);
		await run();
		expect(state.purgeOwners).not.toHaveBeenCalled();
		expect(state.error).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "owner" })
		);
	});

	it("defers recent deleted data while purging idle deleted data", async () => {
		state.storedOwners = owners(8);
		state.storedOwners[1] = { id: "owner-1", recent: 1 };
		state.existingIds = state.storedOwners.slice(2).map(({ id }) => id);
		await run();
		expect(state.purgeOwners).toHaveBeenCalledExactlyOnceWith(["owner-0"]);
		expect(state.audit).toHaveBeenCalledTimes(1);
		expect(state.warn).toHaveBeenCalledWith(
			expect.objectContaining({ deferred_ids: ["owner-1"] })
		);
	});

	it("does not report a safety failure for empty storage", async () => {
		await run();
		expect(state.error).not.toHaveBeenCalled();
		expect(state.audit).not.toHaveBeenCalled();
	});
});
