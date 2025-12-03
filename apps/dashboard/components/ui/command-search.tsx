'use client';

import { CogIcon, LayoutDashboard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DialogProps } from '@radix-ui/react-dialog';
import * as React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command';

// Define a type for website items
interface WebsiteItem {
	id: string;
	name: string;
}

// Static Search items organized by category - to be merged with dynamic items
const staticSearchGroups = [
	{
		category: 'Pages',
		items: [{ name: 'Settings', path: '/settings', icon: CogIcon }],
	},
	// {
	//   category: "Actions",
	//   items: [
	//     { name: "Add New Website", path: "/websites?new=true", icon: Search }, // Placeholder icon
	//     // { name: "Create Report", path: "/reports/new", icon: Search },
	//   ],
	// },
	// {
	//   category: "Help",
	//   items: [
	//     { name: "Documentation", path: "/docs", icon: Search }, // Placeholder icon
	//     // { name: "Support", path: "/support", icon: Search },
	//   ],
	// },
];

interface CommandSearchProps extends DialogProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	userWebsites?: WebsiteItem[]; // Prop for dynamic user websites
}

export function CommandSearch({
	open: controlledOpen,
	onOpenChange: setControlledOpen,
	userWebsites = [], // Default to empty array
	...props
}: CommandSearchProps) {
	const [internalOpen, setInternalOpen] = React.useState(false);
	const router = useRouter();

	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;
	const setOpen = React.useCallback(
		(value: boolean | ((prevState: boolean) => boolean)) => {
			if (isControlled) {
				const newValue =
					typeof value === 'function' ? value(controlledOpen) : value;
				setControlledOpen?.(newValue);
			} else {
				setInternalOpen(value);
			}
		},
		[isControlled, controlledOpen, setControlledOpen]
	);

	useHotkeys(
		['mod+k', '/'],
		() => {
			setOpen((prevOpen) => !prevOpen);
		},
		{ preventDefault: true },
		[setOpen]
	);

	// Combine static and dynamic search items
	const allSearchGroups = React.useMemo(() => {
		const dynamicGroups = [];
		if (userWebsites.length > 0) {
			dynamicGroups.push({
				category: 'My Websites',
				items: userWebsites.map((site) => ({
					name: site.name,
					path: `/websites/${site.id}`,
					icon: LayoutDashboard, // Use LayoutDashboard for websites
				})),
			});
		}
		// Filter out the static "My Websites" link from Pages if dynamic websites are present
		const filteredStaticGroups =
			userWebsites.length > 0
				? staticSearchGroups
						.map((group) => {
							if (group.category === 'Pages') {
								return {
									...group,
									items: group.items.filter(
										(item) => item.path !== '/websites'
									),
								};
							}
							return group;
						})
						.filter((group) => group.items.length > 0) // Ensure group still has items
				: staticSearchGroups;

		return [...dynamicGroups, ...filteredStaticGroups];
	}, [userWebsites]);

	return (
		<CommandDialog onOpenChange={setOpen} open={open} {...props}>
			<CommandInput placeholder="Search websites, pages, actions..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				{allSearchGroups.map((group) => (
					<CommandGroup heading={group.category} key={group.category}>
						{group.items.map((item) => (
							<CommandItem
								className="cursor-pointer"
								key={item.path}
								onSelect={() => {
									setOpen(false);
									router.push(item.path);
								}}
							>
								<item.icon className="mr-2 size-4 text-muted-foreground" />
								<span>{item.name}</span>{' '}
								<span className="text-end text-muted-foreground text-xs">
									{item.path}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				))}
			</CommandList>
		</CommandDialog>
	);
}
