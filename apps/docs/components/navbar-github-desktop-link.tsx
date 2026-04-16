import {
	GithubNavMark,
	GithubStarsBadge,
	githubRepoUrl,
} from "./github-nav-mark";
import { NavLink } from "./nav-link";

interface NavbarGithubDesktopLinkProps {
	stars?: number | null;
}

export function NavbarGithubDesktopLink({
	stars,
}: NavbarGithubDesktopLinkProps) {
	return (
		<NavLink external href={githubRepoUrl}>
			<span className="inline-flex items-center gap-2">
				<GithubNavMark className="transition-transform duration-200 hover:scale-110" />
				{typeof stars === "number" && <GithubStarsBadge stars={stars} />}
			</span>
		</NavLink>
	);
}
