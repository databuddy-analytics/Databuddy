import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CheckCircleIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M9.00012 17C13.4184 17 17.0001 13.4183 17.0001 9C17.0001 4.58172 13.4184 1 9.00012 1C4.58184 1 1.00012 4.58172 1.00012 9C1.00012 13.4183 4.58184 17 9.00012 17Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M8.00012 12.5C7.78822 12.5 7.58512 12.4102 7.44252 12.252L5.19252 9.752C4.91522 9.4439 4.94051 8.9698 5.24821 8.6924C5.55581 8.4155 6.02851 8.44 6.30781 8.7481L7.95622 10.5801L11.6564 5.79151C11.9103 5.46341 12.381 5.40329 12.7091 5.65669C13.0362 5.90959 13.0968 6.3808 12.8439 6.7085L8.59391 12.2085C8.45721 12.3848 8.25012 12.4912 8.02852 12.4995C8.01872 12.5 8.00982 12.5 8.00012 12.5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
CheckCircleIcon.displayName = "CheckCircleIcon";
