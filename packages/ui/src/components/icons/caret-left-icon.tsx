import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CaretLeftIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M13.094 2.44202C12.535 2.13302 11.852 2.15401 11.313 2.49701L3.38904 7.52197C2.88004 7.84497 2.57703 8.397 2.57703 9C2.57703 9.603 2.88104 10.155 3.38904 10.478L11.313 15.503C11.599 15.684 11.924 15.774 12.25 15.774C12.54 15.774 12.831 15.702 13.094 15.557C13.653 15.249 14 14.662 14 14.024V3.97601C14 3.33801 13.653 2.74902 13.094 2.44202Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);
