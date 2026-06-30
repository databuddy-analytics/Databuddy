import { account, member } from "@databuddy/db/schema";
import { sql } from "drizzle-orm";

const ROLE_PRIORITY = sql`CASE ${member.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`;

export function getOAuthTokenOrderBy(preferUserId?: string) {
	return preferUserId
		? [
				sql`CASE WHEN ${account.userId} = ${preferUserId} THEN 0 ELSE 1 END`,
				ROLE_PRIORITY,
			]
		: [ROLE_PRIORITY];
}
