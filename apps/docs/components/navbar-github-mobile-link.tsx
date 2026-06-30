import Link from "next/link";
import { docsNavMobileItem } from "@/components/docs-nav-styles";
import { cn } from "@/lib/utils";
import {
	GithubNavMark,
	GithubStarsBadge,
	githubRepoUrl,
} from "./github-nav-mark";

interface NavbarGithubMobileLinkProps {
	density?: "default" | "compact";
	isMenuOpen: boolean;
	onCloseAction: () => void;
	stars?: number | null;
	transitionDelayMs: number;
}

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
				docsNavMobileItem,
				"group flex transform items-center gap-3 border border-sidebar-border/30 bg-sidebar-accent/20 text-sidebar-foreground/70 transition-all duration-200 hover:translate-x-1",
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
