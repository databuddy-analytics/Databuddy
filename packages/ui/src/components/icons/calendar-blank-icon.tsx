import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CalendarBlankIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="m1.5,5.5v8.25c0,1.5186,1.2307,2.75,2.75,2.75h9.5c1.5193,0,2.75-1.2314,2.75-2.75V5.5H1.5Z"
			data-color="color-2"
			fill="currentColor"
			fillRule="evenodd"
			opacity=".4"
			strokeWidth="0"
		/>
		<path
			d="m6.5,1.25c0-.4142-.3358-.75-.75-.75s-.75.3358-.75.75v1.25h-.75c-1.5192,0-2.75,1.2308-2.75,2.75v1.25h15v-1.25c0-1.5192-1.2308-2.75-2.75-2.75h-.75v-1.25c0-.4142-.3358-.75-.75-.75s-.75.3358-.75.75v1.25h-5v-1.25Z"
			fill="currentColor"
			fillRule="evenodd"
			strokeWidth="0"
		/>
	</NucleoIcon>
);
