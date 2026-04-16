import Link from "next/link";
import { Branding } from "../logo/branding";

export { Branding } from "../logo/branding";
export type { BrandingProps, BrandVariant } from "../logo/branding";

export function Logo() {
	return (
		<Link className="flex items-center" href="/">
			<Branding priority variant="primary-logo" />
		</Link>
	);
}
