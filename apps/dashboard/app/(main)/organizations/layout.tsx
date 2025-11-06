import { OrganizationProvider } from "./components/organization-provider";

export default function OrganizationsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <OrganizationProvider>{children}</OrganizationProvider>;
}
