export function readBooleanEnv(
	name: string,
	environment: Record<string, string | undefined> = process.env
): boolean {
	return environment[name]?.trim().toLowerCase() === "true";
}
