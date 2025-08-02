'use client';

import {
  CaretDownIcon,
  CheckIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { CreateOrganizationDialog } from '@/components/organizations/create-organization-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizations } from '@/hooks/use-organizations';
import { cn } from '@/lib/utils';

const getOrganizationInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export function OrganizationSelector() {
  const {
    organizations,
    activeOrganization,
    isLoading,
    setActiveOrganization,
    isSettingActiveOrganization,
  } = useOrganizations();
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  const handleSelectOrganization = React.useCallback(
    (organizationId: string | null) => {
      if (organizationId === activeOrganization?.id) {
        return;
      }
      if (organizationId === null && !activeOrganization) {
        return;
      }
      setActiveOrganization(organizationId);
    },
    [activeOrganization, setActiveOrganization]
  );

  const handleCreateOrganization = React.useCallback(() => {
    setShowCreateDialog(true);
  }, []);

  const handleManageOrganizations = React.useCallback(() => {
    router.push('/organizations');
  }, [router]);

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-3 w-16 rounded" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                disabled={isSettingActiveOrganization}
              >
                <Avatar className="h-8 w-8 border border-border/50">
                  <AvatarImage
                    alt={activeOrganization?.name || 'Personal'}
                    src={activeOrganization?.logo || undefined}
                  />
                  <AvatarFallback className="bg-muted font-medium text-xs">
                    {activeOrganization?.name ? (
                      getOrganizationInitials(activeOrganization.name)
                    ) : (
                      <UserIcon
                        className="h-4 w-4"
                        size={32}
                        weight="duotone"
                      />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {activeOrganization?.name || 'Personal'}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {activeOrganization?.slug || 'Your workspace'}
                  </span>
                </div>
                <CaretDownIcon className="ml-auto h-4 w-4" weight="duotone" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side="bottom"
              sideOffset={4}
            >
              {/* Personal Workspace */}
              <DropdownMenuItem
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors',
                  'focus:bg-accent focus:text-accent-foreground',
                  !activeOrganization && 'bg-accent text-accent-foreground'
                )}
                onClick={() => handleSelectOrganization(null)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="bg-muted text-xs">
                    <UserIcon className="h-4 w-4" size={32} weight="duotone" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-sm">Personal</span>
                  <span className="text-muted-foreground text-xs">
                    Your workspace
                  </span>
                </div>
                {!activeOrganization && (
                  <CheckIcon
                    className="h-4 w-4 text-primary"
                    size={32}
                    weight="duotone"
                  />
                )}
              </DropdownMenuItem>

              {organizations && organizations.length > 0 && (
                <>
                  <DropdownMenuSeparator className="my-1" />
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors',
                        'focus:bg-accent focus:text-accent-foreground',
                        activeOrganization?.id === org.id &&
                          'bg-accent text-accent-foreground'
                      )}
                      key={org.id}
                      onClick={() => handleSelectOrganization(org.id)}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage alt={org.name} src={org.logo || undefined} />
                        <AvatarFallback className="bg-muted text-xs">
                          {getOrganizationInitials(org.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-sm">
                          {org.name}
                        </span>
                        <span className="truncate text-muted-foreground text-xs">
                          {org.slug}
                        </span>
                      </div>
                      {activeOrganization?.id === org.id && (
                        <CheckIcon
                          className="h-4 w-4 text-primary"
                          size={32}
                          weight="duotone"
                        />
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors focus:bg-accent focus:text-accent-foreground"
                onClick={handleCreateOrganization}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                  <PlusIcon className="h-4 w-4 text-muted-foreground" size={32} />
                </div>
                <span className="font-medium text-sm">Create Organization</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors focus:bg-accent focus:text-accent-foreground"
                onClick={handleManageOrganizations}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                  <UsersIcon
                    className="h-4 w-4 text-muted-foreground"
                    size={32}
                    weight="duotone"
                  />
                </div>
                <span className="font-medium text-sm">Manage Organizations</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateOrganizationDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </>
  );
}