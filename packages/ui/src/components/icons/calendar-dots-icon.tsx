import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CalendarDotsIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="m7.5,14.5c0-1.3784,1.1216-2.5,2.5-2.5h6c.1712,0,.3384.0176.5.0505v-6.5505H1.5v8.25c0,1.5186,1.2307,2.75,2.75,2.75h4.2654c-.6126-.4561-1.0154-1.1792-1.0154-2Z"
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
		<path
			d="m13,15.5c-.551,0-1-.448-1-1s.449-1,1-1,1,.448,1,1-.449,1-1,1Z"
			fill="currentColor"
			strokeWidth="0"
		/>
		<path
			d="m10,15.5c-.551,0-1-.448-1-1s.449-1,1-1,1,.448,1,1-.449,1-1,1Z"
			fill="currentColor"
			strokeWidth="0"
		/>
		<path
			d="m16,15.5c-.551,0-1-.448-1-1s.449-1,1-1,1,.448,1,1-.449,1-1,1Z"
			fill="currentColor"
			strokeWidth="0"
		/>
	</NucleoIcon>
);
CalendarDotsIcon.displayName = "CalendarDotsIcon";
