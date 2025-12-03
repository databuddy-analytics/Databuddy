type SettingsLayoutProps = {
	children: React.ReactNode;
};

export default function SettingsLayout({ children }: SettingsLayoutProps) {
	return <div className="h-full overflow-y-auto">{children}</div>;
}
