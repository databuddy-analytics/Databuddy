import pino from "pino";

export const logger = pino({
	level: "debug",
	name: "databuddy",
});
