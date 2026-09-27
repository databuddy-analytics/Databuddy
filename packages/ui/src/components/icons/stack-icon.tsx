import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const StackIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M15.75 14.5C15.3359 14.5 15 14.1641 15 13.75V4.25C15 3.8359 15.3359 3.5 15.75 3.5C16.1641 3.5 16.5 3.8359 16.5 4.25V13.75C16.5 14.1641 16.1641 14.5 15.75 14.5Z"
			fill="currentColor"
		/>{" "}
		<path
			d="M11.75 16.5H3.75C2.7852 16.5 2 15.7148 2 14.75V3.25C2 2.2852 2.7852 1.5 3.75 1.5H11.75C12.7148 1.5 13.5 2.2852 13.5 3.25V14.75C13.5 15.7148 12.7148 16.5 11.75 16.5Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
	</NucleoIcon>
);
