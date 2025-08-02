'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useWebsites } from '@/hooks/use-websites';
import {
  demoNavigation,
  mainNavigation,
  sandboxNavigation,
  websiteNavigation,
} from './layout/navigation/navigation-config';
import { NavigationSection } from './layout/navigation/navigation-section';
import { SandboxHeader } from './layout/navigation/sandbox-header';
import { WebsiteHeader } from './layout/navigation/website-header';
import { OrganizationSelector } from './layout/organization-selector';

export function AppSidebar() {
  const pathname = usePathname();
  const { websites } = useWebsites();

  const isDemo = pathname.startsWith('/demo');
  const isSandbox = pathname.startsWith('/sandbox');
  const isWebsite = pathname.startsWith('/websites/');

  const websiteId = useMemo(() => {
    return isDemo || isWebsite ? pathname.split('/')[2] : null;
  }, [isDemo, isWebsite, pathname]);

  const currentWebsite = useMemo(() => {
    return websiteId ? websites?.find((site) => site.id === websiteId) : null;
  }, [websiteId, websites]);

  const getNavigationConfig = useMemo(() => {
    if (isWebsite) {
      return {
        navigation: websiteNavigation,
        header: <WebsiteHeader website={currentWebsite} />,
        currentWebsiteId: websiteId,
      };
    }

    if (isDemo) {
      return {
        navigation: demoNavigation,
        header: <WebsiteHeader website={currentWebsite} />,
        currentWebsiteId: websiteId,
      };
    }

    if (isSandbox) {
      return {
        navigation: sandboxNavigation,
        header: <SandboxHeader />,
        currentWebsiteId: 'sandbox',
      };
    }

    return {
      navigation: mainNavigation,
      header: <OrganizationSelector />,
    };
  }, [isWebsite, isDemo, isSandbox, websiteId, currentWebsite]);

  const { navigation, header, currentWebsiteId } = getNavigationConfig;

  return (
    <Sidebar collapsible="offcanvas" className="pt-16">
      <SidebarHeader>
        {header}
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((section) => (
          <NavigationSection
            key={section.title}
            title={section.title}
            items={section.items}
            pathname={pathname}
            currentWebsiteId={currentWebsiteId}
          />
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}