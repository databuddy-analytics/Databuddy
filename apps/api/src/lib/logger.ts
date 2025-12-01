import { logger as sharedLogger } from "@databuddy/shared/logger";

export const logger = sharedLogger.child({
	service: "api",
});
