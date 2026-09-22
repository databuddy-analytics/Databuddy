import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const PackageIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2 7.25C2 5.73128 3.23069 4.5 4.75 4.5H13.25C14.7693 4.5 16 5.73128 16 7.25V13.25C16 14.7687 14.7693 16 13.25 16H4.75C3.23069 16 2 14.7687 2 13.25V7.25Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M4.5 12.75C4.5 12.3358 4.83579 12 5.25 12H7.25C7.66421 12 8 12.3358 8 12.75C8 13.1642 7.66421 13.5 7.25 13.5H5.25C4.83579 13.5 4.5 13.1642 4.5 12.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>{" "}
		<path
			d="M15.6445 5.89654C15.1723 5.06272 14.2771 4.5 13.25 4.5H4.75C3.71996 4.5 2.82259 5.06594 2.35143 5.9037L3.77709 3.0288C4.24151 2.09309 5.1956 1.5 6.241 1.5H11.759C12.8044 1.5 13.7584 2.09285 14.2228 3.02856L15.6445 5.89654Z"
			fill="currentColor"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M9.00002 3.5C9.41423 3.5 9.75002 3.83579 9.75002 4.25V7.25C9.75002 7.66421 9.41423 8 9.00002 8C8.5858 8 8.25002 7.66421 8.25002 7.25V4.25C8.25002 3.83579 8.5858 3.5 9.00002 3.5Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
