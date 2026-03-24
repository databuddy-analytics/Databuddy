import Link from "next/link";
import { Branding } from "../logo/branding";

export type { BrandingProps, BrandVariant } from "../logo/branding";
export { Branding } from "../logo/branding";

export function Logo() {
	return (
		<Link className="flex items-center" href="/">
			<Branding priority variant="primary-logo" />
		</Link>
	);
}

export function LogoSVG({ ...props }: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height="600"
			viewBox="0 0 600 600"
			width="600"
			xmlns="http://www.w3.org/2000/svg"
			{...props}
		>
			<path
				d="M305 290C305 292.761 307.239 295 310 295H395C397.761 295 400 297.239 400 300V395C400 397.761 397.761 400 395 400H300C297.239 400 295 397.761 295 395V310C295 307.239 292.761 305 290 305H205C202.239 305 200 302.761 200 300V205C200 202.239 202.239 200 205 200H300C302.761 200 305 202.239 305 205V290Z"
				fill="currentColor"
			/>
			<path
				clipRule="evenodd"
				d="M600 495C600 497.761 597.761 500 595 500H505C502.239 500 500 502.239 500 505V595C500 597.761 497.761 600 495 600H5C2.23857 600 0 597.761 0 595V5C0 2.23857 2.23858 0 5 0H495C497.761 0 500 2.23858 500 5V95C500 97.7614 502.239 100 505 100H595C597.761 100 600 102.239 600 105V495ZM110 100C107.239 100 105 102.239 105 105V495C105 497.761 107.239 500 110 500H490C492.761 500 495 497.761 495 495V105C495 102.239 492.761 100 490 100H110Z"
				fill="currentColor"
				fillRule="evenodd"
			/>
		</svg>
	);
}
