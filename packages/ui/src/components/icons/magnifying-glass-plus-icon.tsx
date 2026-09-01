import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const MagnifyingGlassPlusIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M1.5 7.75C1.5 4.29829 4.29829 1.5 7.75 1.5C11.2017 1.5 14 4.29829 14 7.75C14 11.2017 11.2017 14 7.75 14C4.29829 14 1.5 11.2017 1.5 7.75Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M11.6073 12.668L15.2197 16.2803C15.5126 16.5732 15.9874 16.5732 16.2803 16.2803C16.5732 15.9874 16.5732 15.5126 16.2803 15.2197L12.668 11.6073C12.3581 12.0018 12.0018 12.3581 11.6073 12.668Z"
			fill="currentColor"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M8.5 5.25C8.5 4.83579 8.16421 4.5 7.75 4.5C7.33579 4.5 7 4.83579 7 5.25V7H5.25C4.83579 7 4.5 7.33579 4.5 7.75C4.5 8.16421 4.83579 8.5 5.25 8.5H7V10.25C7 10.6642 7.33579 11 7.75 11C8.16421 11 8.5 10.6642 8.5 10.25V8.5H10.25C10.6642 8.5 11 8.16421 11 7.75C11 7.33579 10.6642 7 10.25 7H8.5V5.25Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
