import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const BracketsSquareIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M11.25 2.75C11.25 2.33579 11.5858 2 12 2H14.25C15.2162 2 16 2.78379 16 3.75V14.25C16 15.2162 15.2162 16 14.25 16H12C11.5858 16 11.25 15.6642 11.25 15.25C11.25 14.8358 11.5858 14.5 12 14.5H14.25C14.3878 14.5 14.5 14.3878 14.5 14.25V3.75C14.5 3.61221 14.3878 3.5 14.25 3.5H12C11.5858 3.5 11.25 3.16421 11.25 2.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M3.75 3.5C3.61221 3.5 3.5 3.61221 3.5 3.75V14.25C3.5 14.3878 3.61221 14.5 3.75 14.5H6C6.41421 14.5 6.75 14.8358 6.75 15.25C6.75 15.6642 6.41421 16 6 16H3.75C2.78379 16 2 15.2162 2 14.25V3.75C2 2.78379 2.78379 2 3.75 2H6C6.41421 2 6.75 2.33579 6.75 2.75C6.75 3.16421 6.41421 3.5 6 3.5H3.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
BracketsSquareIcon.displayName = "BracketsSquareIcon";
