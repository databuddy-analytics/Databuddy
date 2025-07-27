import { Geist_Mono } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-geist-mono',
});

export function LogoContent() {
  return (
    <div className="group flex items-center gap-3">
      <div className="relative flex-shrink-0">
        <Image
          alt="DataBuddy Logo"
          className="drop-shadow-sm invert dark:invert-0"
          height={32}
          priority
          src="/logo.svg"
          width={32}
        />
      </div>
      <div className="flex items-center">
        <h1
          className={`
          ${geistMono.variable}text-lg select-none font-semibold leading-none tracking-wider transition-colors duration-200 `}
        >
          DATABUDDY
        </h1>
      </div>
    </div>
  );
}

// Full Logo component with Link wrapper - for standalone use
export function Logo() {
  return (
    <Link className="flex items-center gap-3" href="/">
      <div className="relative flex-shrink-0">
        <Image
          alt="DataBuddy Logo"
          className="drop-shadow-sm"
          height={32}
          priority
          src="/logo.svg"
          width={32}
        />
      </div>
      <div className="flex items-center">
        <h1 className="select-none font-mono font-semibold text-lg leading-none tracking-wider transition-colors duration-200 ">
          DATABUDDY
        </h1>
      </div>
    </Link>
  );
}
