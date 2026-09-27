import { NucleoIcon, type NucleoIconProps } from "./nucleo-icon";

export const CursorIcon = ({ ref, ...props }: NucleoIconProps) => (
	<NucleoIcon ref={ref} {...props}>
		<path
			d="M15.0925 6.23803C16.5405 6.77419 16.5325 8.82624 15.0786 9.34922L11 10.8173C10.9135 10.8487 10.847 10.9161 10.8174 10.9987L9.34858 15.0786C8.82554 16.5323 6.77322 16.5406 6.23705 15.0927L2.28796 4.45967C2.26886 4.40808 2.24934 4.35666 2.23296 4.30413C1.83685 3.03388 3.04404 1.82845 4.31725 2.23762C4.37349 2.25569 4.42863 2.27705 4.48402 2.29757L15.0925 6.23803Z"
			data-color="color-2"
			fill="currentColor"
			fillOpacity="0.4"
		/>
	</NucleoIcon>
);
