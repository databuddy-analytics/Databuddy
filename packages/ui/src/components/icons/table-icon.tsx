import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const TableIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M3.75 16C2.233 16 1 14.767 1 13.25V4.75C1 3.233 2.233 2 3.75 2H6V16H3.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path
			d="M17 13.25C17 14.767 15.767 16 14.25 16H6V2H14.25C15.767 2 17 3.233 17 4.75L17 13.25Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path d="M1 12.25H17L17 10.75H1V12.25Z" fill="currentColor" />{" "}
		<path d="M1 7.25H17L17 5.75H1V7.25Z" fill="currentColor" />{" "}
		<path d="M5 2L5 16L6.5 16L6.5 2L5 2Z" fill="currentColor" />
	</NucleoIcon>
);
