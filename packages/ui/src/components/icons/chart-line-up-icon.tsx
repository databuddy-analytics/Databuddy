import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ChartLineUpIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M2.75 2C3.16421 2 3.5 2.33579 3.5 2.75V12.75C3.5 13.4408 4.05921 14 4.75 14H15.25C15.6642 14 16 14.3358 16 14.75C16 15.1642 15.6642 15.5 15.25 15.5H4.75C3.23079 15.5 2 14.2692 2 12.75V2.75C2 2.33579 2.33579 2 2.75 2Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>{" "}
		<path
			clipRule="evenodd"
			d="M11.75 5.5C11.3358 5.5 11 5.83579 11 6.25C11 6.66421 11.3358 7 11.75 7H13.4393L10.7495 9.68982L7.63333 6.57365C7.14544 6.08576 6.35356 6.08576 5.86567 6.57365L3.5 8.93932V11.0606L6.7495 7.81114L9.86567 10.9273C10.3536 11.4152 11.1454 11.4152 11.6333 10.9273L14.5 8.06066V9.75C14.5 10.1642 14.8358 10.5 15.25 10.5C15.6642 10.5 16 10.1642 16 9.75V6.25C16 5.83579 15.6642 5.5 15.25 5.5H11.75Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
ChartLineUpIcon.displayName = "ChartLineUpIcon";
