import { config } from "@databuddy/env/app";
import { type DrainContext, initLogger } from "evlog";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation";

export const { withEvlog } = createEvlog({
	service: "dashboard",
	exclude: ["/api/auth/get-session"],
});

const instrumentation = createInstrumentation({ service: "dashboard" });

export const { onRequestError } = instrumentation;

export async function register() {
	const [authLogger, redaction, drain] = await Promise.all([
		import("@databuddy/auth/logger"),
		import("@databuddy/shared/evlog-redaction"),
		loadAxiomDrain(),
	]);
	const loggerConfig = {
		env: redaction.createDatabuddyEvlogEnv("dashboard"),
		redact: redaction.databuddyEvlogRedaction,
		drain,
	};
	// Locks the logger so withEvlog() cannot reset the drain and redaction set
	// next; the lock does not stop initLogger() itself.
	instrumentation.register();
	initLogger(loggerConfig);
	authLogger.initLogger(loggerConfig);
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
