import pino from "pino";

type AxiomConfig = {
	token: string;
	dataset: string;
};

function canLoadAxiomTransport(): boolean {
	try {
		require.resolve("@axiomhq/pino");
		return true;
	} catch {
		return false;
	}
}

function createLoggerConfig(
	name: string,
	axiomConfig?: AxiomConfig
): pino.LoggerOptions {
	const config: pino.LoggerOptions = {
		level: "debug",
		name,
	};

	// Only set up Axiom transport if:
	// 1. Axiom config is provided
	// 2. The @axiomhq/pino module can be resolved
	if (axiomConfig?.token && axiomConfig?.dataset && canLoadAxiomTransport()) {
		config.transport = {
			target: "@axiomhq/pino",
			options: {
				token: axiomConfig.token,
				dataset: axiomConfig.dataset,
			},
		};
	}

	return config;
}

const defaultAxiomConfig: AxiomConfig | undefined =
	process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET
		? {
				token: process.env.AXIOM_TOKEN,
				dataset: process.env.AXIOM_DATASET,
			}
		: undefined;

export const logger = pino(createLoggerConfig("databuddy", defaultAxiomConfig));

export function createLogger(
	name: string,
	axiomConfig?: AxiomConfig
): pino.Logger {
	return pino(createLoggerConfig(name, axiomConfig));
}
