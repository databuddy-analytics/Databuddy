import type { ResourceType } from "@databuddy/auth/permissions";
import { db } from "@databuddy/db";
import { rpcError } from "../errors";
import type { Context } from "../orpc";
import { type Permissions, withWorkspace } from "./with-workspace";

const registry = {
	monitor: {
		authResource: "monitor",
		label: "Monitor",
		load: (id: string) => db.query.uptimeSchedules.findFirst({ where: { id } }),
	},
	status_page: {
		authResource: "status_page",
		label: "Status page",
		load: (id: string) => db.query.statusPages.findFirst({ where: { id } }),
	},
	alarm: {
		authResource: "organization",
		label: "Alarm",
		load: (id: string) =>
			db.query.alarms.findFirst({
				where: { id },
				with: { destinations: true },
			}),
	},
	website: {
		authResource: "website",
		label: "Website",
		load: (id: string) => db.query.websites.findFirst({ where: { id } }),
	},
} as const satisfies Record<
	string,
	{
		authResource: ResourceType;
		label: string;
		load: (
			id: string
		) => Promise<{ organizationId: string | null } | undefined>;
	}
>;

type Registry = typeof registry;

export type RegisteredResource = keyof Registry;

type RowOf<K extends RegisteredResource> = NonNullable<
	Awaited<ReturnType<Registry[K]["load"]>>
>;

type AuthResourceOf<K extends RegisteredResource> = Registry[K]["authResource"];

export interface WithResourceOptions<K extends RegisteredResource> {
	id: string;
	permissions: Permissions<AuthResourceOf<K>>;
	resource: K;
}

async function loadOrThrow<K extends RegisteredResource>(
	resource: K,
	id: string
): Promise<RowOf<K>> {
	const entry = registry[resource];
	const row = await entry.load(id);
	if (!row) {
		throw rpcError.notFound(entry.label, id);
	}
	return row as RowOf<K>;
}

export async function withResource<K extends RegisteredResource>(
	context: Context,
	options: WithResourceOptions<K>
): Promise<RowOf<K>> {
	const entry = registry[options.resource];
	const row = await loadOrThrow(options.resource, options.id);
	await withWorkspace<AuthResourceOf<K>>(context, {
		organizationId: row.organizationId,
		resource: entry.authResource as AuthResourceOf<K>,
		permissions: options.permissions,
	});
	return row;
}

type TransferableResource = Exclude<RegisteredResource, "alarm">;

export interface AuthorizeTransferOptions<K extends TransferableResource> {
	id: string;
	resource: K;
	targetOrganizationId: string;
}

export async function authorizeTransfer<K extends TransferableResource>(
	context: Context,
	options: AuthorizeTransferOptions<K>
): Promise<RowOf<K>> {
	const entry = registry[options.resource];
	const row = await loadOrThrow(options.resource, options.id);

	if (row.organizationId === options.targetOrganizationId) {
		throw rpcError.badRequest(
			`${entry.label} already belongs to this organization`
		);
	}

	await withWorkspace(context, {
		organizationId: row.organizationId,
		resource: entry.authResource,
		permissions: ["update"],
		allowCrossOrg: true,
	});

	await withWorkspace(context, {
		organizationId: options.targetOrganizationId,
		resource: entry.authResource,
		permissions: ["create"],
		allowCrossOrg: true,
	});

	return row;
}
