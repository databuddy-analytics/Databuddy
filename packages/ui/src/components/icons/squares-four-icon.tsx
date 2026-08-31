import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const SquaresFourIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M15.7501 9.75H2.25009C1.83599 9.75 1.50009 9.4141 1.50009 9C1.50009 8.5859 1.83599 8.25 2.25009 8.25H15.7501C16.1642 8.25 16.5001 8.5859 16.5001 9C16.5001 9.4141 16.1642 9.75 15.7501 9.75Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M9.00009 16.5C8.58599 16.5 8.25009 16.1641 8.25009 15.75V2.25C8.25009 1.8359 8.58599 1.5 9.00009 1.5C9.41419 1.5 9.75009 1.8359 9.75009 2.25V15.75C9.75009 16.1641 9.41419 16.5 9.00009 16.5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
SquaresFourIcon.displayName = "SquaresFourIcon";
