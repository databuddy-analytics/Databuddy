export type LinkDependencyStatus = "disabled" | "error" | "ok" | "pending";

export interface LinkHealthStatuses {
	clickhouse: LinkDependencyStatus;
	deliveryQueue: LinkDependencyStatus;
	postgres: LinkDependencyStatus;
	redis: LinkDependencyStatus;
	redpanda: LinkDependencyStatus;
}

export interface LinkReadiness {
	httpStatus: 200 | 503;
	status: "degraded" | "ok" | "unavailable";
}

export function calculateLinkReadiness(
	services: LinkHealthStatuses
): LinkReadiness {
	const admissionReady =
		services.postgres === "ok" &&
		services.redis === "ok" &&
		services.deliveryQueue === "ok";
	const deliverySinkReady =
		services.clickhouse === "ok" || services.redpanda === "ok";
	if (!(admissionReady && deliverySinkReady)) {
		return { httpStatus: 503, status: "unavailable" };
	}

	const degraded =
		services.clickhouse === "error" || services.redpanda === "error";
	return {
		httpStatus: 200,
		status: degraded ? "degraded" : "ok",
	};
}
