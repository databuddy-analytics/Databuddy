import { log } from "evlog";

const base = { service: "rpc" as const };

type Fields = Record<string, unknown>;

function emit(
	level: "error" | "info" | "warn",
	fieldsOrMessage: Fields | string,
	message?: string
): void {
	if (typeof fieldsOrMessage === "string") {
		log[level]({ ...base, message: fieldsOrMessage });
	} else if (message !== undefined) {
		log[level]({ ...base, ...fieldsOrMessage, message });
	}
}

/**
 * Pino-compatible (obj, msg) or (msg) logging via evlog global `log`.
 */
export const logger = {
	error: (fieldsOrMessage: Fields | string, message?: string) =>
		emit("error", fieldsOrMessage, message),
	info: (fieldsOrMessage: Fields | string, message?: string) =>
		emit("info", fieldsOrMessage, message),
	warn: (fieldsOrMessage: Fields | string, message?: string) =>
		emit("warn", fieldsOrMessage, message),
};
