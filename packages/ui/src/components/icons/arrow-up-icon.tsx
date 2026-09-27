import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ArrowUpIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M9 16C8.586 16 8.25 15.664 8.25 15.25V3C8.25 2.586 8.586 2.25 9 2.25C9.414 2.25 9.75 2.586 9.75 3V15.25C9.75 15.664 9.414 16 9 16Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M13.25 7.74999C13.058 7.74999 12.866 7.67699 12.72 7.52999L8.99999 3.80999L5.27999 7.52999C4.98699 7.82299 4.51199 7.82299 4.21899 7.52999C3.92599 7.23699 3.92599 6.76199 4.21899 6.46899L8.46999 2.21999C8.76299 1.92699 9.238 1.92699 9.531 2.21999L13.781 6.46999C14.074 6.76299 14.074 7.238 13.781 7.531C13.635 7.677 13.443 7.751 13.251 7.751L13.25 7.74999Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
