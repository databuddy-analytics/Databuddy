import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const LightbulbIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M7.76863 1.12885C11.4751 0.354749 14.75 3.16999 14.75 6.74999C14.75 8.82737 13.6463 10.6414 12 11.6506V13L5.99996 13V11.6505C4.0676 10.4651 2.89153 8.17058 3.35019 5.66114L3.35049 5.65951C3.76531 3.41782 5.59416 1.58298 7.76863 1.12885Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
		<path
			d="M12 13V14.25C12 15.7692 10.7692 17 9.25 17H8.75C7.23079 17 6 15.7692 6 14.25V13H12Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
