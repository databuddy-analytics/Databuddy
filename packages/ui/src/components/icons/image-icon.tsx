import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ImageIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2.00098 4.75C2.00098 3.23119 3.23217 2 4.75098 2H13.251C14.7698 2 16.001 3.23119 16.001 4.75V13.25C16.001 14.7688 14.7698 16 13.251 16H4.75098C3.23217 16 2.00098 14.7688 2.00098 13.25V4.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M16.001 13.25V12.1893L13.1953 9.38367C12.1214 8.30977 10.3806 8.30977 9.30667 9.38367L3.18172 15.5086C3.62674 15.8184 4.16765 16 4.75098 16H13.251C14.7698 16 16.001 14.7688 16.001 13.25Z"
			fill="currentColor"
		/>{" "}
		<path
			d="M6.25098 8.5C6.94138 8.5 7.50098 7.9404 7.50098 7.25C7.50098 6.5596 6.94138 6 6.25098 6C5.56058 6 5.00098 6.5596 5.00098 7.25C5.00098 7.9404 5.56058 8.5 6.25098 8.5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
ImageIcon.displayName = "ImageIcon";
