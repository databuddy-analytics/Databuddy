import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const VolumeUpIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			clipRule="evenodd"
			d="M10.0759 1.61119C10.9072 1.07941 12 1.67539 12 2.664V15.337C12 16.3256 10.9072 16.9216 10.0759 16.3898L4.78051 13H2.25C1.00779 13 0 11.9922 0 10.75V7.25C0 6.00778 1.00779 5 2.25 5H4.78056L10.0759 1.61119Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M15.3287 5.11066C15.6216 4.81777 16.0964 4.81777 16.3893 5.11066C18.5372 7.25855 18.5372 10.7414 16.3893 12.8893C16.0964 13.1822 15.6216 13.1822 15.3287 12.8893C15.0358 12.5964 15.0358 12.1215 15.3287 11.8287C16.8908 10.2665 16.8908 7.73343 15.3287 6.17132C15.0358 5.87843 15.0358 5.40355 15.3287 5.11066Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
		<path
			clipRule="evenodd"
			d="M13.9454 7.17258C14.2615 7.07665 14.6031 7.19882 14.7867 7.47344C15.403 8.39538 15.403 9.60456 14.7867 10.5265C14.6031 10.8011 14.2615 10.9233 13.9454 10.8274C13.6293 10.7314 13.4132 10.44 13.4132 10.1097V7.89026C13.4132 7.55993 13.6293 7.2685 13.9454 7.17258Z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</NucleoIcon>
);
VolumeUpIcon.displayName = "VolumeUpIcon";
