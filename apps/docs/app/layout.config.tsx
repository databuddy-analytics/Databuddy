import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { FaDiscord, FaGithub, FaXTwitter } from 'react-icons/fa6';
import { MdSpaceDashboard } from 'react-icons/md';
import { LogoContent } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export const baseOptions: BaseLayoutProps = {
  nav: {
    enabled: false,
    title: <LogoContent />,
    transparentMode: 'top',
    children: <ThemeToggle />,
  },
  links: [
    {
      text: 'Dashboard',
      url: 'https://app.databuddy.cc',
      external: true,
      icon: <MdSpaceDashboard />,
    },
    {
      text: 'GitHub',
      url: 'https://github.com/databuddy-analytics',
      external: true,
      icon: <FaGithub />,
      secondary: true,
    },
    {
      text: 'Discord',
      url: 'https://discord.gg/JTk7a38tCZ',
      external: true,
      icon: <FaDiscord />,
    },
    {
      text: 'X (Twitter)',
      url: 'https://x.com/trydatabuddy',
      external: true,
      icon: <FaXTwitter />,
    },
  ],
};
