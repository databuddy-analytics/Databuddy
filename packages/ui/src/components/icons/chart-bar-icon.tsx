import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const ChartBarIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="m15.25,15.5H4.75c-1.5166,0-2.75-1.2334-2.75-2.75V2.75c0-.4141.3359-.75.75-.75s.75.3359.75.75v10c0,.6895.5605,1.25,1.25,1.25h10.5c.4141,0,.75.3359.75.75s-.3359.75-.75.75Z"
			data-color="color-2"
			fill="currentColor"
			opacity=".4"
			strokeWidth="0"
		/>
		<rect
			fill="currentColor"
			height="8.5"
			rx="1"
			ry="1"
			strokeWidth="0"
			width="3.5"
			x="10.5"
			y="3.5"
		/>
		<rect
			fill="currentColor"
			height="5"
			rx="1"
			ry="1"
			strokeWidth="0"
			width="3.5"
			x="5.5"
			y="7"
		/>
	</NucleoIcon>
);
ChartBarIcon.displayName = "ChartBarIcon";
