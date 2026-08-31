import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ArrowLeftIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M15.25 9.75H3C2.586 9.75 2.25 9.414 2.25 9C2.25 8.586 2.586 8.25 3 8.25H15.25C15.664 8.25 16 8.586 16 9C16 9.414 15.664 9.75 15.25 9.75Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M6.99999 14C6.80799 14 6.61599 13.927 6.46999 13.78L2.21999 9.52999C1.92699 9.23699 1.92699 8.76199 2.21999 8.46899L6.46999 4.21999C6.76299 3.92699 7.238 3.92699 7.531 4.21999C7.824 4.51299 7.824 4.988 7.531 5.281L3.811 9.001L7.531 12.721C7.824 13.014 7.824 13.489 7.531 13.782C7.385 13.928 7.193 14.002 7.001 14.002L6.99999 14Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
ArrowLeftIcon.displayName = "ArrowLeftIcon";
