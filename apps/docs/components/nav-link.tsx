import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export type NavSection =
	| "navbar"
	| "navbar_mobile"
	| "navbar_features"
	| "footer"
	| "footer_legal";

interface NavLinkProps {
	children: ReactNode;
	className?: string;
	external?: boolean;
	href: string;
	navItem: string;
	onClick?: () => void;
	rel?: string;
	role?: string;
	section?: NavSection;
	style?: CSSProperties;
	target?: string;
}

export function NavLink({
	children,
	className,
	external,
	href,
	navItem,
	onClick,
	rel,
	role,
	section = "navbar",
	style,
	target,
}: NavLinkProps) {
	const Component = external ? "a" : Link;
	const externalProps = external
		? {
				rel: rel ?? "noopener noreferrer",
				target: target ?? "_blank",
			}
		: { rel, target };

	return (
		<Component
			className={className}
			data-destination={external ? "external" : "internal"}
			data-nav-item={navItem}
			data-section={section}
			data-track="nav_clicked"
			href={href}
			onClick={onClick}
			role={role}
			style={style}
			{...externalProps}
		>
			{children}
		</Component>
	);
}
