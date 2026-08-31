import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const LaptopIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M4.25 15.5C2.73079 15.5 1.5 14.2692 1.5 12.75V4.75C1.5 3.23079 2.73079 2 4.25 2H13.75C15.2692 2 16.5 3.23079 16.5 4.75V12.75C16.5 14.2692 15.2692 15.5 13.75 15.5H4.25Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M0 14.75C0 14.3358 0.335786 14 0.75 14H17.25C17.6642 14 18 14.3358 18 14.75C18 15.1642 17.6642 15.5 17.25 15.5H0.75C0.335786 15.5 0 15.1642 0 14.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
LaptopIcon.displayName = "LaptopIcon";
