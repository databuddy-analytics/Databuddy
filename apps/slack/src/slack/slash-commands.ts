import { createSlackEventLog, setSlackLog, toError } from "@/lib/evlog-slack";
import type { SlackInstallationServices } from "@/slack/installations";
import { SLACK_COPY } from "@/slack/messages";
import type {
	SlackLogger,
	SlackSlashCommand,
	SlackSlashRespond,
} from "@/slack/types";

export async function respondToBindCommand({
	command,
	installations,
	logger,
	respond,
}: {
	command: SlackSlashCommand;
	installations: SlackInstallationServices;
	logger: SlackLogger;
	respond: SlackSlashRespond;
}): Promise<void> {
	const eventLog = createSlackEventLog({
		slack_channel_id: command.channel_id,
		slack_command: "/bind",
		slack_event: "slash_command",
		slack_team_id: command.team_id,
		slack_user_id: command.user_id,
	});
	const startedAt = performance.now();
	try {
		const result = await installations.bindChannel({
			channelId: command.channel_id,
			teamId: command.team_id,
		});
		setSlackLog(eventLog, {
			slack_bind_ok: result.ok,
			"timing.slack_bind_ms": Math.round(performance.now() - startedAt),
		});
		await respond({
			response_type: "ephemeral",
			text: result.message,
		});
	} catch (error) {
		const err = toError(error);
		logger.error(err);
		eventLog.error(err, { error_step: "bind_channel" });
		await respond({
			response_type: "ephemeral",
			text: SLACK_COPY.bindFailure,
		});
	} finally {
		eventLog.emit();
	}
}

export async function respondToStatusCommand({
	command,
	installations,
	logger,
	respond,
}: {
	command: SlackSlashCommand;
	installations: SlackInstallationServices;
	logger: SlackLogger;
	respond: SlackSlashRespond;
}): Promise<void> {
	const eventLog = createSlackEventLog({
		slack_channel_id: command.channel_id,
		slack_command: "/databuddy-status",
		slack_event: "slash_command",
		slack_team_id: command.team_id,
		slack_user_id: command.user_id,
	});
	try {
		const teamContext = await installations.getTeamContext(command.team_id);
		if (!teamContext) {
			await respond({
				response_type: "ephemeral",
				text: SLACK_COPY.missingWorkspace,
			});
			return;
		}

		const readiness = await installations.getChannelReadiness({
			autoBind: false,
			channelId: command.channel_id,
			teamId: command.team_id,
		});
		await respond({
			response_type: "ephemeral",
			text: readiness.ok
				? SLACK_COPY.statusReady
				: `${SLACK_COPY.statusConnected}\n\n${readiness.message}`,
		});
		setSlackLog(eventLog, {
			slack_status_ready: readiness.ok,
			slack_integration_id: teamContext.integrationId,
			slack_organization_id: teamContext.organizationId,
		});
	} catch (error) {
		const err = toError(error);
		logger.error(err);
		eventLog.error(err, { error_step: "status_command" });
		await respond({
			response_type: "ephemeral",
			text: SLACK_COPY.statusFailure,
		});
	} finally {
		eventLog.emit();
	}
}
