import {
	NotificationClient,
	buildAlarmNotificationConfig,
	buildAlarmNotificationTargets,
	type NotificationPayload,
	type NotificationResult,
} from "@databuddy/notifications";

export const toNotificationConfig = buildAlarmNotificationConfig;
export const toNotificationTargets = buildAlarmNotificationTargets;

type NotificationTarget = ReturnType<
	typeof buildAlarmNotificationTargets
>[number];

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function sendNotificationTarget(
	target: NotificationTarget,
	payload: NotificationPayload
): Promise<NotificationResult[]> {
	try {
		return await new NotificationClient(target.clientConfig).send(payload, {
			channels: [target.channel],
		});
	} catch (error) {
		return [
			{
				success: false,
				channel: target.channel,
				error: getErrorMessage(error),
			},
		];
	}
}
