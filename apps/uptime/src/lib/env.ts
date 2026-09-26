const environment =
	process.env.APP_ENV ??
	process.env.RAILWAY_ENVIRONMENT_NAME ??
	(process.env.NODE_ENV === "development" ? "development" : "production");

export const UPTIME_ENV = {
	environment,
	isProduction: environment === "production",
} as const;
