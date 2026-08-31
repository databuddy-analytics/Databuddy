import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const FileTextIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M15.487 5.427L11.572 1.512C11.2442 1.1841 10.7996 1 10.336 1H4.75C3.2312 1 2 2.2312 2 3.75V14.25C2 15.7688 3.2312 17 4.75 17H13.25C14.7688 17 16 15.7688 16 14.25V6.6655C16 6.2009 15.8155 5.7553 15.487 5.427Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path
			d="M15.8691 6.00098H12C11.45 6.00098 11 5.55098 11 5.00098V1.13101C11.212 1.21806 11.4068 1.34677 11.572 1.512L15.487 5.427C15.6527 5.59266 15.7818 5.7882 15.8691 6.00098Z"
			fill="currentColor"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M5 6.75C5 6.33579 5.33579 6 5.75 6H7.75C8.16421 6 8.5 6.33579 8.5 6.75C8.5 7.16421 8.16421 7.5 7.75 7.5H5.75C5.33579 7.5 5 7.16421 5 6.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M5 9.75C5 9.33579 5.33579 9 5.75 9H12.25C12.6642 9 13 9.33579 13 9.75C13 10.1642 12.6642 10.5 12.25 10.5H5.75C5.33579 10.5 5 10.1642 5 9.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M5 12.75C5 12.3358 5.33579 12 5.75 12H12.25C12.6642 12 13 12.3358 13 12.75C13 13.1642 12.6642 13.5 12.25 13.5H5.75C5.33579 13.5 5 13.1642 5 12.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
FileTextIcon.displayName = "FileTextIcon";
