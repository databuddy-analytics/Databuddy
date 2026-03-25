import { randomUUIDv7 } from "bun";
import type { Context } from "../src/orpc";

interface MockDatabase {
    query: {
        flags: {
            findMany: () => Promise<unknown[]>;
            findFirst: () => Promise<unknown | undefined>;
        };
        targetGroups: {
            findMany: () => Promise<unknown[]>;
        };
    };
    select: () => MockDatabase;
    from: () => MockDatabase;
    where: () => MockDatabase;
    limit: () => MockDatabase;
    update: () => MockDatabase;
    set: () => MockDatabase;
    returning: () => Promise<unknown[]>;
    insert: () => MockDatabase;
    values: () => MockDatabase;
    delete: () => MockDatabase;
}

const createMockDb = (): MockDatabase => ({
    query: {
        flags: {
            findMany: async () => [],
            findFirst: async () => undefined,
        },
        targetGroups: {
            findMany: async () => [],
        },
    },
    select: () => createMockDb(),
    from: () => createMockDb(),
    where: () => createMockDb(),
    limit: () => createMockDb(),
    update: () => createMockDb(),
    set: () => createMockDb(),
    returning: async () => [],
    insert: () => createMockDb(),
    values: () => createMockDb(),
    delete: () => createMockDb(),
});

export async function createTestContext(): Promise<Context> {
    return {
        user: {
            id: randomUUIDv7(),
            email: "test@example.com",
            name: "Test User"
        },
        db: createMockDb() as Context['db'],
        req: {} as Context['req'],
        res: {} as Context['res']
    };
}

export async function createTestWebsite(context: Context) {
    const websiteId = randomUUIDv7();
    return {
        id: websiteId,
        name: "Test Website",
        domain: "test.com",
        createdBy: context.user.id,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

interface TestFlagOverrides {
    key?: string;
    name?: string;
    type?: string;
    status?: string;
    defaultValue?: boolean;
    folder?: string | null;
    websiteId?: string;
    dependencies?: string[];
    rules?: unknown[];
    variants?: unknown[];
    targetGroupIds?: string[];
    [key: string]: unknown;
}

export async function createTestFlag(context: Context, overrides: TestFlagOverrides = {}) {
    const flagId = randomUUIDv7();
    return {
        id: flagId,
        key: overrides.key || `test-flag-${flagId}`,
        name: overrides.name || "Test Flag",
        type: overrides.type || "boolean",
        status: overrides.status || "active",
        defaultValue: overrides.defaultValue ?? false,
        folder: overrides.folder ?? null,
        websiteId: overrides.websiteId,
        createdBy: context.user.id,
        dependencies: overrides.dependencies || [],
        rules: overrides.rules || [],
        variants: overrides.variants || [],
        targetGroupIds: overrides.targetGroupIds || [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}