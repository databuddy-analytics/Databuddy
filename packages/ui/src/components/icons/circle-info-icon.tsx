import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CircleInfoIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M9 1C4.5889 1 1 4.5889 1 9C1 13.4111 4.5889 17 9 17C13.4111 17 17 13.4111 17 9C17 4.5889 13.4111 1 9 1Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path
			d="M9.75 12.75C9.75 13.1641 9.4141 13.5 9 13.5C8.5859 13.5 8.25 13.1641 8.25 12.75V9.5H7.75C7.3359 9.5 7 9.1641 7 8.75C7 8.3359 7.3359 8 7.75 8H8.5C9.1895 8 9.75 8.5605 9.75 9.25V12.75ZM9 6.75C8.448 6.75 8 6.301 8 5.75C8 5.199 8.448 4.75 9 4.75C9.552 4.75 10 5.199 10 5.75C10 6.301 9.552 6.75 9 6.75Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
CircleInfoIcon.displayName = "CircleInfoIcon";
