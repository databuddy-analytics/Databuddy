export { cn } from "cn";

export async function getGithubStars(): Promise<number | null> {
	try {
		const response = await fetch(
			"https://api.github.com/repos/databuddy-analytics/databuddy",
			{
				headers: {
					Accept: "application/vnd.github+json",
				},
				next: { revalidate: 3600 },
			}
		);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as { stargazers_count?: number };
		return typeof data.stargazers_count === "number"
			? data.stargazers_count
			: null;
	} catch {
		return null;
	}
}
