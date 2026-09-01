import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const SidebarLeftIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M14.2501 2H3.75012C2.23134 2 1.00012 3.23122 1.00012 4.75V13.25C1.00012 14.7688 2.23134 16 3.75012 16H14.2501C15.7689 16 17.0001 14.7688 17.0001 13.25V4.75C17.0001 3.23122 15.7689 2 14.2501 2Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path
			d="M7.00012 2H3.75012C2.23352 2 1.00012 3.2334 1.00012 4.75V13.25C1.00012 14.7666 2.23352 16 3.75012 16H7.00012V2Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
