import { Button } from "@databuddy/ui";
import {
	GithubNavMark,
	GithubStarsBadge,
	githubRepoUrl,
} from "./github-nav-mark";

interface NavbarGithubDesktopLinkProps {
	stars?: number | null;
}

export function NavbarGithubDesktopLink({
	stars,
}: NavbarGithubDesktopLinkProps) {
	return (
		<Button asChild className="text-white" size="sm" variant="ghost">
			<a href={githubRepoUrl} rel="noopener noreferrer" target="_blank">
				<GithubNavMark />
				{typeof stars === "number" && <GithubStarsBadge stars={stars} />}
			</a>
		</Button>
	);
}
