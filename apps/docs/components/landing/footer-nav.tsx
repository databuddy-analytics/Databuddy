import { SciFiButton } from "./scifi-btn";

export const FooterNav = () => {
  return (
    <div className="flex items-center justify-center gap-52 py-12">
      <div className="flex flex-col gap-8">
        <h1 className="text-[32px]">{`You're just one click away.`}</h1>
        <div>
          <SciFiButton>GET STARTED</SciFiButton>
        </div>
      </div>
      <div>
        <NavLinks />
      </div>
    </div>
  );
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
    <div className="flex items-center justify-center p-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-16 max-w-4xl w-full">
        {navItems.map((section, index) => (
          <div key={index} className="space-y-8">
            <h2 className="text-xs text-muted-foreground uppercase">
              {section.header}
            </h2>
            <div className="space-y-3">
              {section.items.map((item, itemIndex) => (
                <div key={itemIndex}>
                  <a
                    href={item.link}
                    className="text-xs hover:underline hover:underline-offset-4 block"
                    target={item.link.startsWith("http") ? "_blank" : "_self"}
                    rel={
                      item.link.startsWith("http") ? "noopener noreferrer" : ""
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
