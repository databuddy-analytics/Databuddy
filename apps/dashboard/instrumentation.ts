export async function register() {
	if (
		process.env.NEXT_RUNTIME !== "nodejs" ||
		process.env.NODE_ENV === "development" ||
		!process.env.AXIOM_TOKEN
	) {
		return;
	}
	const [
		{ initLogger },
		{ createAxiomDrain },
		{ waitUntil },
		redaction,
		axiom,
	] = await Promise.all([
		import("@databuddy/auth/logger"),
		import("evlog/axiom"),
		import("@vercel/functions"),
		import("@databuddy/shared/evlog-redaction"),
		import("@databuddy/shared/evlog-axiom"),
	]);
	const drainToAxiom = createAxiomDrain({
		apiKey: process.env.AXIOM_TOKEN,
		dataset: "dashboard",
	});
	initLogger({
		env: redaction.createDatabuddyEvlogEnv("dashboard"),
		redact: redaction.databuddyEvlogRedaction,
		drain: (ctx) => {
			axiom.normalizeWideEventForAxiom(ctx.event);
			// Serverless functions can freeze once the response is sent.
			waitUntil(drainToAxiom(ctx));
		},
	});
}
