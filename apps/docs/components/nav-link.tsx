import Link from 'next/link';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}

export function NavLink({ href, children, className, external }: NavLinkProps) {
  const Component = external ? 'a' : Link;
  const externalProps = external
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};

  // Generate tracking data based on href and children
  const getTrackingData = () => {
    const childrenText = typeof children === 'string' ? children : 'nav-item';
    const trackingName = childrenText.toLowerCase().replace(/\s+/g, '-');

    return {
      'data-track': 'navbar-nav-click',
      'data-section': 'navbar',
      'data-nav-item': trackingName,
      'data-destination': href.startsWith('http') ? 'external' : 'internal',
      'data-is-external': external ? 'true' : 'false',
    };
  };

  return (
    <Component
      className={cn(
        'flex items-center gap-2 px-4 py-4 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground',
        className
      )}
      href={href}
      {...externalProps}
      {...getTrackingData()}
    >
      {children}
    </Component>
  );
}
