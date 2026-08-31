import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const PlusIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M14.7501 9.75H3.25009C2.83599 9.75 2.50009 9.4141 2.50009 9C2.50009 8.5859 2.83599 8.25 3.25009 8.25H14.7501C15.1642 8.25 15.5001 8.5859 15.5001 9C15.5001 9.4141 15.1642 9.75 14.7501 9.75Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M9.00009 15.5C8.58599 15.5 8.25009 15.1641 8.25009 14.75V3.25C8.25009 2.8359 8.58599 2.5 9.00009 2.5C9.41419 2.5 9.75009 2.8359 9.75009 3.25V14.75C9.75009 15.1641 9.41419 15.5 9.00009 15.5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
PlusIcon.displayName = "PlusIcon";
