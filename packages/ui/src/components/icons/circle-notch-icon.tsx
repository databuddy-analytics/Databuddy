import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CircleNotchIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="m9,11.5c1.3807,0,2.5-1.1193,2.5-2.5s-1.1193-2.5-2.5-2.5-2.5,1.1193-2.5,2.5,1.1193,2.5,2.5,2.5Z"
			data-color="color-2"
			fill="currentColor"
			opacity=".4"
			strokeWidth="0"
		/>
		<circle cx="9" cy="3" fill="currentColor" r="2" strokeWidth="0" />
		<circle
			cx="3.8038"
			cy="6"
			fill="currentColor"
			opacity=".2"
			r="2"
			strokeWidth="0"
		/>
		<circle
			cx="3.8038"
			cy="12"
			fill="currentColor"
			opacity=".36"
			r="2"
			strokeWidth="0"
		/>
		<circle
			cx="9"
			cy="15"
			fill="currentColor"
			opacity=".52"
			r="2"
			strokeWidth="0"
		/>
		<circle
			cx="14.1962"
			cy="12"
			fill="currentColor"
			opacity=".68"
			r="2"
			strokeWidth="0"
		/>
		<circle
			cx="14.1962"
			cy="6"
			fill="currentColor"
			opacity=".84"
			r="2"
			strokeWidth="0"
		/>
	</NucleoIcon>
);
CircleNotchIcon.displayName = "CircleNotchIcon";
