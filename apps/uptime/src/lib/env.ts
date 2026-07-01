const environment =
	process.env.APP_ENV ??
	process.env.RAILWAY_ENVIRONMENT_NAME ??
	(process.env.NODE_ENV === "development" ? "development" : "production");

export const UPTIME_ENV = {
	environment,
	isDev: process.env.NODE_ENV === "development",
	isProduction: environment === "production",
} as const;
