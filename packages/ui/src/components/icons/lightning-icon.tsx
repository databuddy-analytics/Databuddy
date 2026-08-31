import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const LightningIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M5.67585 1.81984C5.8563 1.32701 6.32578 1 6.84901 1H11.019C11.8998 1 12.5011 1.88388 12.1844 2.70181L12.184 2.70281L11.0963 5.5H13.75C14.7808 5.5 15.3669 6.67577 14.7505 7.49942L7.85001 16.7C7.63299 16.9894 7.24039 17.0826 6.91644 16.9217C6.59249 16.7609 6.4295 16.3917 6.52886 16.044L8.25571 10H4.46602C3.59645 10 2.99323 9.13488 3.29298 8.31947"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
LightningIcon.displayName = "LightningIcon";
