import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const BuildingsIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M9 6.75C9 5.78379 9.78379 5 10.75 5H15.25C16.2162 5 17 5.78379 17 6.75V14.75C17 15.7162 16.2162 16.5 15.25 16.5H9.75C9.33579 16.5 9 16.1642 9 15.75V6.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path
			d="M2.75 8C1.78379 8 1 8.78379 1 9.75V14.75C1 15.7162 1.78379 16.5 2.75 16.5H6.75C7.16421 16.5 7.5 16.1642 7.5 15.75V9.75C7.5 8.78379 6.71621 8 5.75 8H2.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M11.5 8.75C11.5 8.33579 11.8358 8 12.25 8H13.75C14.1642 8 14.5 8.33579 14.5 8.75C14.5 9.16421 14.1642 9.5 13.75 9.5H12.25C11.8358 9.5 11.5 9.16421 11.5 8.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M11.5 11.25C11.5 10.8358 11.8358 10.5 12.25 10.5H13.75C14.1642 10.5 14.5 10.8358 14.5 11.25C14.5 11.6642 14.1642 12 13.75 12H12.25C11.8358 12 11.5 11.6642 11.5 11.25Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M13 2.43201C13 1.21576 11.7905 0.370625 10.6482 0.788703L5.14789 2.80482C4.46015 3.05792 4 3.71236 4 4.448V8H5.75C6.71621 8 7.5 8.78379 7.5 9.75V15.75C7.5 16.1642 7.16421 16.5 6.75 16.5H9.75C9.33579 16.5 9 16.1642 9 15.75V6.75C9 5.78379 9.78379 5 10.75 5H13V2.43201Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
