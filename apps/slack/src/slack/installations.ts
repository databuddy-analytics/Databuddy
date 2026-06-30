import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { and, db, eq } from "@databuddy/db";
import { slackChannelBindings, slackIntegrations } from "@databuddy/db/schema";
import { decrypt } from "@databuddy/encryption";
import {
	cacheNamespaces,
	cacheable,
	invalidateSlackChannelBindingCache,
} from "@databuddy/redis";
import { createInternalPrincipal } from "@databuddy/rpc";
import type { Authorize } from "@slack/bolt";
import { randomUUIDv7 } from "bun";
import type {
	SlackAgentRun,
	SlackRunContext,
	SlackRunContextResolver,
} from "@/agent/agent-client";
import type { TokenCryptoConfig } from "@/config";
import { createSlackEventLog, setSlackLog, toError } from "@/lib/evlog-slack";
import { SLACK_COPY } from "@/slack/messages";

const SLACK_AGENT_SCOPES = [
	"read:data",
	"read:links",
	"write:links",
	"manage:websites",
	"manage:flags",
	"manage:config",
] as const;
const SLACK_AGENT_RESOURCES = { global: [...SLACK_AGENT_SCOPES] };

function buildSlackApiKey(installation: ActiveSlackIntegration): ApiKeyRow {
	const principal = createInternalPrincipal({
		createdAt: installation.createdAt,
		id: `slack:${installation.id}`,
		metadata: {
			description: "Slack integration agent identity.",
			resources: SLACK_AGENT_RESOURCES,
			tags: ["slack", "integration"],
		},
		name: `Slack Agent - ${installation.teamId}`,
		organizationId: installation.organizationId,
		prefix: "slack",
		rateLimitEnabled: true,
		scopes: [...SLACK_AGENT_SCOPES],
		start: installation.id.slice(0, 8),
		updatedAt: installation.updatedAt,
		userId: installation.installedByUserId,
	});
	if (!principal.apiKey) {
		throw new Error("createInternalPrincipal returned no apiKey");
	}
	return principal.apiKey;
}

export interface SlackChannelBindingCommand {
	channelId: string;
	teamId?: string;
}

export interface SlackChannelBindingCommandResult {
	autoBound?: boolean;
	message: string;
	ok: boolean;
}

export interface SlackTeamContext {
	integrationId: string;
	organizationId: string;
}

export type SlackInstallationServices = Pick<
	SlackInstallationStore,
	"bindChannel" | "getChannelReadiness" | "getTeamContext"
>;

export class SlackInstallationStore implements SlackRunContextResolver {
	readonly #crypto: TokenCryptoConfig;

	constructor(crypto: TokenCryptoConfig) {
		this.#crypto = crypto;
	}

	async authorize(teamId: string) {
		const eventLog = createSlackEventLog({
			slack_event: "authorize",
			slack_team_id: teamId,
		});
		const startedAt = performance.now();

		try {
			const installation = await findActiveIntegration(teamId);
			if (!installation) {
				setSlackLog(eventLog, { slack_authorized: false });
				throw new Error(`Slack team ${teamId} is not connected to Databuddy`);
			}

			setSlackLog(eventLog, {
				slack_authorized: true,
				slack_bot_id: installation.botId,
				slack_integration_id: installation.id,
				slack_organization_id: installation.organizationId,
			});

			return {
				botId: installation.botId ?? undefined,
				botToken: decrypt(
					installation.botTokenCiphertext,
					this.#crypto.encryptionKey
				),
				botUserId: installation.botUserId ?? undefined,
				teamId,
			};
		} catch (error) {
			const err = toError(error);
			eventLog.error(err, { error_step: "authorize" });
			throw err;
		} finally {
			setSlackLog(eventLog, {
				"timing.slack_authorize_ms": Math.round(performance.now() - startedAt),
			});
			eventLog.emit();
		}
	}

	async resolve(run: SlackAgentRun): Promise<SlackRunContext | null> {
		if (!run.teamId) {
			return null;
		}

		const installation = await findActiveIntegration(run.teamId);
		return installation ? this.toRunContext(installation) : null;
	}

	async getTeamContext(teamId?: string): Promise<SlackTeamContext | null> {
		if (!teamId) {
			return null;
		}
		const installation = await findActiveIntegration(teamId);
		return installation
			? {
					integrationId: installation.id,
					organizationId: installation.organizationId,
				}
			: null;
	}

	async bindChannel({
		channelId,
		teamId,
	}: SlackChannelBindingCommand): Promise<SlackChannelBindingCommandResult> {
		if (!teamId) {
			return {
				message: SLACK_COPY.missingTeam,
				ok: false,
			};
		}

		const installation = await findActiveIntegration(teamId);
		if (!installation) {
			return {
				message: SLACK_COPY.missingWorkspace,
				ok: false,
			};
		}

		await upsertChannelBinding(installation.id, channelId);

		return {
			message: SLACK_COPY.bindSuccess,
			ok: true,
		};
	}

	async getChannelReadiness({
		autoBind = false,
		channelId,
		teamId,
	}: SlackChannelBindingCommand & {
		autoBind?: boolean;
	}): Promise<SlackChannelBindingCommandResult> {
		if (!teamId) {
			return {
				message: SLACK_COPY.missingTeam,
				ok: false,
			};
		}

		const installation = await findActiveIntegration(teamId);
		if (!installation) {
			return {
				message: SLACK_COPY.missingWorkspace,
				ok: false,
			};
		}

		const binding = await findChannelBinding(installation.id, channelId);
		if (!binding) {
			if (autoBind) {
				await upsertChannelBinding(installation.id, channelId);
				createSlackEventLog({
					slack_channel_id: channelId,
					slack_event: "channel_auto_bind",
					slack_integration_id: installation.id,
					slack_organization_id: installation.organizationId,
					slack_team_id: teamId,
				}).emit();
				return {
					autoBound: true,
					message: SLACK_COPY.autoBindSuccess,
					ok: true,
				};
			}
			return {
				message: SLACK_COPY.channelNotBound,
				ok: false,
			};
		}

		return {
			message: "",
			ok: true,
		};
	}

	private toRunContext(installation: ActiveSlackIntegration): SlackRunContext {
		return {
			apiKey: buildSlackApiKey(installation),
			organizationId: installation.organizationId,
			teamId: installation.teamId,
		};
	}
}

export function createSlackAuthorize(
	installations: SlackInstallationStore
): Authorize<boolean> {
	return async ({ teamId }) => {
		if (!teamId) {
			throw new Error("Slack authorize source did not include a team id");
		}
		return await installations.authorize(teamId);
	};
}

const SLACK_INTEGRATION_CACHE_TTL_SEC = 300;
const SLACK_CHANNEL_BINDING_CACHE_TTL_SEC = 300;

const findActiveIntegration = cacheable(
	(teamId: string) =>
		db
			.select({
				id: slackIntegrations.id,
				botId: slackIntegrations.botId,
				botTokenCiphertext: slackIntegrations.botTokenCiphertext,
				botUserId: slackIntegrations.botUserId,
				createdAt: slackIntegrations.createdAt,
				installedByUserId: slackIntegrations.installedByUserId,
				organizationId: slackIntegrations.organizationId,
				teamId: slackIntegrations.teamId,
				updatedAt: slackIntegrations.updatedAt,
			})
			.from(slackIntegrations)
			.where(
				and(
					eq(slackIntegrations.teamId, teamId),
					eq(slackIntegrations.status, "active")
				)
			)
			.limit(1)
			.then(([installation]) => installation ?? null),
	{
		expireInSec: SLACK_INTEGRATION_CACHE_TTL_SEC,
		prefix: cacheNamespaces.slackIntegrationByTeam,
	}
);

const findChannelBinding = cacheable(
	(integrationId: string, channelId: string) =>
		db
			.select({ id: slackChannelBindings.id })
			.from(slackChannelBindings)
			.where(
				and(
					eq(slackChannelBindings.integrationId, integrationId),
					eq(slackChannelBindings.slackChannelId, channelId)
				)
			)
			.limit(1)
			.then(([binding]) => binding ?? null),
	{
		expireInSec: SLACK_CHANNEL_BINDING_CACHE_TTL_SEC,
		prefix: cacheNamespaces.slackChannelBinding,
	}
);

async function upsertChannelBinding(
	integrationId: string,
	channelId: string
): Promise<void> {
	const now = new Date();
	await db
		.insert(slackChannelBindings)
		.values({
			createdAt: now,
			id: randomUUIDv7(),
			integrationId,
			slackChannelId: channelId,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			set: { updatedAt: now },
			target: [
				slackChannelBindings.integrationId,
				slackChannelBindings.slackChannelId,
			],
		});
	await invalidateSlackChannelBindingCache(integrationId, channelId);
}

type ActiveSlackIntegration = NonNullable<
	Awaited<ReturnType<typeof findActiveIntegration>>
>;
