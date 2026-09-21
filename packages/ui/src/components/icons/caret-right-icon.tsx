import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CaretRightIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M14.611 7.52196L6.687 2.49699C6.147 2.15499 5.46401 2.134 4.90601 2.442C4.34701 2.75 4 3.33696 4 3.97496V14.024C4 14.662 4.34701 15.25 4.90601 15.557C5.16901 15.702 5.46 15.774 5.75 15.774C6.076 15.774 6.402 15.683 6.688 15.502L14.611 10.478C15.12 10.155 15.423 9.60298 15.423 8.99998C15.423 8.39698 15.119 7.84496 14.611 7.52196Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);
