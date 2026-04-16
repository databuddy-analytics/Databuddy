export const FLAG_KEY_LABELS: Record<string, string> = {
	monitors: "Uptime Monitoring",
	insights: "AI Insights",
	revenue: "Revenue Analytics",
	anomalies: "Anomaly Detection",
	pulse: "Pulse",
	agent: "AI Agent",
};

export const FLAG_KEY_DESCRIPTIONS: Record<string, string> = {
	monitors:
		"Track uptime, latency, and receive alerts when your services go down.",
	insights: "Get AI-powered analytics insights across your websites.",
	revenue: "Track revenue attribution and conversion analytics.",
	anomalies: "Detect unusual traffic patterns and performance anomalies.",
	pulse: "Real-time uptime monitoring and status checks for your websites.",
	agent: "AI-powered agent for automated analytics tasks.",
};

export const FLAG_KEY_ROUTES: Record<string, string> = {
	monitors: "/monitors",
	insights: "/insights",
	revenue: "/websites",
	anomalies: "/websites",
	pulse: "/websites",
	agent: "/websites",
};

export function getFeatureLabel(flagKey: string): string {
	return FLAG_KEY_LABELS[flagKey] ?? flagKey;
}

export function getFeatureDescription(flagKey: string): string {
	return (
		FLAG_KEY_DESCRIPTIONS[flagKey] ?? "This feature requires an invitation."
	);
}

export function getFeatureRoute(flagKey: string): string {
	return FLAG_KEY_ROUTES[flagKey] ?? "/home";
}
