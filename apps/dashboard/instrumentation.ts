import { config } from "@databuddy/env/app";
import type { DrainContext } from "evlog";

export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}
	const [authLogger, auditLogger, redaction, drain] = await Promise.all([
		import("@databuddy/auth/logger"),
		import("@databuddy/shared/audit"),
		import("@databuddy/shared/evlog-redaction"),
		loadAxiomDrain(),
	]);
	const loggerConfig = {
		env: redaction.createDatabuddyEvlogEnv("dashboard"),
		redact: redaction.databuddyEvlogRedaction,
		drain,
	};
	authLogger.initLogger(loggerConfig);
	auditLogger.initLogger(loggerConfig);
}

async function loadAxiomDrain() {
	const apiKey = config.services.axiomToken;
	if (!apiKey) {
		return;
	}
	const [{ createAxiomDrain }, { waitUntil }, axiom] = await Promise.all([
		import("evlog/axiom"),
		import("@vercel/functions"),
		import("@databuddy/shared/evlog-axiom"),
	]);
	const drainToAxiom = createAxiomDrain({ apiKey, dataset: "dashboard" });
	return (ctx: DrainContext) => {
		axiom.normalizeWideEventForAxiom(ctx.event);
		// Serverless functions can freeze once the response is sent.
		waitUntil(drainToAxiom(ctx));
	};
}
