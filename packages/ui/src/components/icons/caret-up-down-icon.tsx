import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CaretUpDownIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M9 2.25c-.322 0-.621.168-.788.443l-3 4.95A.937.937 0 0 0 6 8.625h6a.937.937 0 0 0 .788-1.432l-3-4.5A.937.937 0 0 0 9 2.25ZM9 15.75c.322 0 .621-.168.788-.443l3-4.95A.937.937 0 0 0 12 9.375H6a.937.937 0 0 0-.788 1.432l3 4.5c.167.275.466.443.788.443Z"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);
