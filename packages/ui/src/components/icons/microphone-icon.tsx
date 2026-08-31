import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const MicrophoneIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M9 1.5C7.4812 1.5 6.25 2.7312 6.25 4.25V8.75C6.25 10.2688 7.4812 11.5 9 11.5C10.5188 11.5 11.75 10.2688 11.75 8.75V4.25C11.75 2.7312 10.5188 1.5 9 1.5Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path
			clipRule="evenodd"
			d="M4.25 8C4.6642 8 5 8.3358 5 8.75C5 10.9591 6.7909 12.75 9 12.75C11.2091 12.75 13 10.9591 13 8.75C13 8.3358 13.3358 8 13.75 8C14.1642 8 14.5 8.3358 14.5 8.75C14.5 11.536 12.4294 13.8379 9.75 14.2V15H11.25C11.6642 15 12 15.3358 12 15.75C12 16.1642 11.6642 16.5 11.25 16.5H6.75C6.3358 16.5 6 16.1642 6 15.75C6 15.3358 6.3358 15 6.75 15H8.25V14.2C5.5706 13.8379 3.5 11.536 3.5 8.75C3.5 8.3358 3.8358 8 4.25 8Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
MicrophoneIcon.displayName = "MicrophoneIcon";
