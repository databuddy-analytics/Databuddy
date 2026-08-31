import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const EyeIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M16.6085 7.51709C15.547 5.64359 13.1476 3 9.00008 3C4.85258 3 2.45318 5.64359 1.39218 7.51709C0.865777 8.44579 0.865777 9.55421 1.39168 10.4829C2.45318 12.3564 4.85258 15 9.00008 15C13.1476 15 15.547 12.3564 16.608 10.4829C17.1344 9.55471 17.1344 8.44579 16.6085 7.51709Z"
			data-color="color-2"
			fill="currentColor"
			opacity="0.4"
		/>
		<path
			d="M9 12C10.6568 12 12 10.657 12 9C12 7.343 10.6568 6 9 6C7.3432 6 6 7.343 6 9C6 10.657 7.3432 12 9 12Z"
			fill="currentColor"
		/>
	</NucleoIcon>
);
EyeIcon.displayName = "EyeIcon";
