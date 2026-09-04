import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const TagIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M10 16.6704C9.2959 16.6704 8.5918 16.4023 8.0557 15.8662L2.3057 10.1162C1.7862 9.5967 1.5 8.90621 1.5 8.17191V3.25C1.5 2.2852 2.2852 1.5 3.25 1.5H8.1719C8.9063 1.5 9.5967 1.78609 10.1162 2.30569L15.8662 8.05569C16.9385 9.12799 16.9385 10.8721 15.8662 11.9444L11.9443 15.8663C11.4082 16.4024 10.7041 16.6704 10 16.6704Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>{" "}
		<path
			d="M6.25 7.5C6.94036 7.5 7.5 6.94036 7.5 6.25C7.5 5.55964 6.94036 5 6.25 5C5.55964 5 5 5.55964 5 6.25C5 6.94036 5.55964 7.5 6.25 7.5Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
