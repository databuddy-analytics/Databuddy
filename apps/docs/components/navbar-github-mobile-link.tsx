import Link from "next/link";
import { cn } from "@/lib/utils";
import {
	GithubNavMark,
	GithubStarsBadge,
	githubRepoUrl,
} from "./github-nav-mark";

type NavbarGithubMobileLinkProps = {
	stars?: number | null;
	isMenuOpen: boolean;
	transitionDelayMs: number;
	onCloseAction: () => void;
	density?: "default" | "compact";
};

export function NavbarGithubMobileLink({
	stars,
	isMenuOpen,
	transitionDelayMs,
	onCloseAction,
	density = "default",
}: NavbarGithubMobileLinkProps) {
	const densityClass =
		density === "compact" ? "px-3 py-2 text-sm" : "px-4 py-3 text-base";

	return (
		<Link
			className={cn(
				"group flex transform items-center gap-3 rounded border border-border/30 font-medium transition-all duration-200 hover:translate-x-1 hover:border-border/50 hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 active:bg-muted/70",
				densityClass,
				isMenuOpen ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
			)}
			href={githubRepoUrl}
			onClick={onCloseAction}
			rel="noopener noreferrer"
			style={{
				transitionDelay: isMenuOpen ? `${transitionDelayMs}ms` : "0ms",
			}}
			target="_blank"
		>
			<GithubNavMark className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
			<span className="flex items-center gap-2">
				GitHub
				{typeof stars === "number" && <GithubStarsBadge stars={stars} />}
			</span>
		</Link>
	);
}
