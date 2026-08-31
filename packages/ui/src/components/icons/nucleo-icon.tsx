import type React from "react";

export type NucleoIconProps = React.SVGProps<SVGSVGElement> & {
	size?: number | string;
	title?: string;
	weight?: string;
};

export const NucleoIcon = ({
	size = 18,
	weight: _weight,
	children,
	title,
	ref,
	...props
}: NucleoIconProps) => (
	<svg
		aria-hidden={title ? undefined : true}
		fill="currentColor"
		height={size}
		ref={ref}
		role={title ? "img" : undefined}
		viewBox="0 0 18 18"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		{title ? <title>{title}</title> : null}
		{children}
	</svg>
);
NucleoIcon.displayName = "NucleoIcon";
