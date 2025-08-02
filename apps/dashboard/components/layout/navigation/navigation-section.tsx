'use client';

import { ExternalLinkIcon } from 'lucide-react';
import type { IconProps } from '@phosphor-icons/react';
import Link from 'next/link';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { NavigationItem } from './types';

interface NavigationSectionProps {
  title: string;
  items: NavigationItem[];
  pathname: string;
  currentWebsiteId?: string | null;
}

export function NavigationSection({
  title,
  items,
  pathname,
  currentWebsiteId,
}: NavigationSectionProps) {
  const isDemo = pathname.startsWith('/demo');
  const isSandbox = pathname.startsWith('/sandbox');
  const isWebsite = pathname.startsWith('/websites/');

  const getItemHref = (item: NavigationItem) => {
    const production = process.env.NODE_ENV === 'production';
    if (item.production === false && production) {
      return '#';
    }

    if (item.rootLevel) {
      return item.href;
    }

    let basePath = '';
    if (isDemo && currentWebsiteId) {
      basePath = `/demo/${currentWebsiteId}`;
    } else if (isWebsite && currentWebsiteId) {
      basePath = `/websites/${currentWebsiteId}`;
    } else if (isSandbox) {
      basePath = '/sandbox';
    }

    return `${basePath}${item.href}`;
  };

  const isItemActive = (item: NavigationItem) => {
    const production = process.env.NODE_ENV === 'production';
    if (item.production === false && production) {
      return false;
    }

    const itemHref = getItemHref(item);
    if (item.href === '' && pathname === itemHref) {
      return true;
    }
    if (item.href !== '' && pathname.startsWith(itemHref)) {
      return true;
    }
    return false;
  };

  const filteredItems = items.filter((item) => {
    const production = process.env.NODE_ENV === 'production';
    return !(item.production === false && production);
  });

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {filteredItems.map((item) => {
          const Icon = item.icon as React.FC<IconProps>;
          const isActive = isItemActive(item);
          const isDisabled = item.production === false && process.env.NODE_ENV === 'production';
          const href = getItemHref(item);

          if (item.external) {
            return (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(isDisabled && 'pointer-events-none opacity-50')}
                  >
                    <Icon size={20} weight="duotone" />
                    <span>{item.name}</span>
                    {item.alpha && (
                      <SidebarMenuBadge className="ml-auto">Alpha</SidebarMenuBadge>
                    )}
                    <ExternalLinkIcon className="ml-2 h-3 w-3" />
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton asChild isActive={isActive}>
                <Link
                  href={href}
                  className={cn(isDisabled && 'pointer-events-none opacity-50')}
                >
                  <Icon size={20} weight="duotone" className="not-dark:text-primary" />
                  <span>{item.name}</span>
                  {item.alpha && (
                    <SidebarMenuBadge className="ml-auto">Alpha</SidebarMenuBadge>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}