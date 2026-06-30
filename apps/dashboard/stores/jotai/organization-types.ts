import type { authClient } from "@databuddy/auth/client";

export type Organization = NonNullable<
	ReturnType<typeof authClient.useListOrganizations>["data"]
>[number];
