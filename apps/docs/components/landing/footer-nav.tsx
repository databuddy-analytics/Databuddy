"use client";
import { SciFiButton } from "./scifi-btn";

export const FooterNav = () => {
  const handleGetStarted = () => {
    const newWindow = window.open(
      "https://app.databuddy.cc/login",
      "_blank",
      "noopener,noreferrer",
    );
    if (
      !newWindow ||
      newWindow.closed ||
      typeof newWindow.closed == "undefined"
    ) {
      // Handle popup blocked case if needed
    }
  };

  const navItems = [
    {
      header: "Product",
      items: [
        {
          title: "Pricing",
          link: "/pricing",
        },
        {
          title: "Dashboard",
          link: "https://app.databuddy.cc",
        },
        {
          title: "Documentation",
          link: "/docs",
        },
      ],
    },
    {
      header: "Company",
      items: [
        {
          title: "Blog",
          link: "/blog",
        },
        {
          title: "Privacy Policy",
          link: "/privacy",
        },
        {
          title: "Terms & Conditions",
          link: "/terms",
        },
      ],
    },
    {
      header: "Contact",
      items: [
        {
          title: "Discord",
          link: "https://discord.com/invite/JTk7a38tCZ",
        },
        {
          title: "Github",
          link: "https://github.com/databuddy-analytics",
        },
        {
          title: "X(Twitter)",
          link: "https://x.com/trydatabuddy",
        },
        {
          title: "support@databuddy.cc",
          link: "mailto:support@databuddy.cc",
        },
      ],
    },
  ];

  const NavLinks = () => {
    return (
      <div className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10 lg:gap-12">
          {navItems.map((section, index) => (
            <div key={index} className="space-y-4 lg:space-y-6">
              <h3 className="text-xs sm:text-sm text-muted-foreground uppercase font-medium tracking-wider">
                {section.header}
              </h3>
              <div className="space-y-2 lg:space-y-3">
                {section.items.map((item, itemIndex) => (
                  <div key={itemIndex}>
                    <a
                      href={item.link}
                      className="text-sm sm:text-base text-foreground hover:text-primary hover:underline hover:underline-offset-4 transition-colors duration-200 block"
                      target={item.link.startsWith("http") ? "_blank" : "_self"}
                      rel={
                        item.link.startsWith("http")
                          ? "noopener noreferrer"
                          : ""
                      }
                    >
                      {item.title}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Mobile Layout */}
      <div className="block lg:hidden space-y-12">
        {/* CTA Section */}
        <div className="text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-medium leading-tight">
            You're just one click away.
          </h2>
          <div>
            <SciFiButton onClick={handleGetStarted}>GET STARTED</SciFiButton>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="px-4">
          <NavLinks />
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex items-start justify-between gap-16 xl:gap-24">
        {/* CTA Section */}
        <div className="flex-shrink-0 space-y-6 xl:space-y-8">
          <h2 className="text-2xl xl:text-3xl font-medium leading-tight max-w-sm">
            You're just one click away.
          </h2>
          <div>
            <SciFiButton onClick={handleGetStarted}>GET STARTED</SciFiButton>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 max-w-2xl">
          <NavLinks />
        </div>
      </div>
    </div>
  );
};
