"use client";

// Credits to better-auth for the inspiration

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

const XIcon = () => (
  <svg
    aria-label="Twitter/X"
    className="h-5 w-5 text-muted-foreground transition-colors duration-300 group-hover:text-foreground"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <title>Twitter/X</title>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const testimonials = [
  {
    name: "Dominik",
    profession: "Founder, Rivo.gg",
    link: "https://x.com/DominikDoesDev/status/1929921951000101188",
    description: "Hands down one of the sexiest analytic tools out there😍",
    avatar: "dominik.jpg",
    social: <XIcon />,
  },
  {
    name: "Bekacru",
    profession: "Founder, Better-auth",
    description: "this looks great!",
    avatar: "bekacru.jpg",
  },
  {
    name: "John Yeo",
    profession: "Co-Founder, Autumn",
    description:
      "Actually game changing going from Framer analytics to @trydatabuddy. We're such happy customers.",
    link: "https://x.com/johnyeo_/status/1945061131342532846",
    social: <XIcon />,
    avatar:
      "https://pbs.twimg.com/profile_images/1935046528114016256/ZDKw5J0F_400x400.jpg",
  },
  {
    name: "Axel Wesselgren",
    profession: "Founder, Stackster",
    description:
      "Who just switched to the best data analytics platform?\n\n Me.",
    link: "https://x.com/axelwesselgren/status/1936670098884079755",
    social: <XIcon />,
    avatar:
      "https://pbs.twimg.com/profile_images/1937981565176344576/H-CnDlga_400x400.jpg",
  },
  {
    name: "Max",
    profession: "Founder, Pantom Studio",
    description: "won't lie @trydatabuddy is very easy to setup damn",
    link: "https://x.com/Metagravity0/status/1945592294612017208",
    social: <XIcon />,
    avatar:
      "https://pbs.twimg.com/profile_images/1929548168317837312/eP97J41s_400x400.jpg",
  },
  {
    name: "Ahmet Kilinc",
    link: "https://x.com/bruvimtired/status/1938972393357062401",
    social: <XIcon />,
    profession: "Software Engineer, @mail0dotcom",
    description:
      "if you're not using @trydatabuddy then your analytics are going down the drain.",
    avatar: "ahmet.jpg",
  },
  {
    name: "Maze",
    profession: "Founder, OpenCut",
    link: "https://x.com/mazeincoding/status/1943019005339455631",
    social: <XIcon />,
    description:
      "@trydatabuddy is the only analytics i love, it's so simple and easy to use.",
    avatar: "maze.jpg",
  },
  {
    name: "Yassr Atti",
    profession: "Founder, Call",
    description: "everything you need for analytics is at @trydatabuddy 🔥",
    link: "https://x.com/Yassr_Atti/status/1944455392018461107",
    social: <XIcon />,
    avatar: "yassr.jpg",
  },
  {
    name: "Ping Maxwell",
    profession: "SWE, Better-auth",
    link: "https://x.com/PingStruggles/status/1944862561935221168",
    social: <XIcon />,
    description:
      "Databuddy is the only analytics platform I've used that I can genuinely say is actually GDPR compliant, and an absolute beast of a product.  Worth a try!",
    avatar: "ping.jpg",
  },
];

function TestimonialCard({
  testimonial,
}: {
  testimonial: (typeof testimonials)[0];
}) {
  const CardContent = () => (
    <div className="group relative flex h-[200px] w-[300px] shrink-0 flex-col justify-between rounded-xl border border-border bg-card/70 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10 sm:h-[220px] sm:w-[350px] lg:h-[240px] lg:w-[400px]">
      <p className="text-pretty px-4 pt-4 font-light text-foreground text-sm tracking-tight leading-relaxed sm:px-5 sm:pt-5 sm:text-base lg:px-6 lg:pt-6 lg:text-base">
        &quot;{testimonial.description}&quot;
      </p>
      <div className="flex h-[65px] w-full items-center gap-1 border-border border-t bg-card/20 sm:h-[70px] lg:h-[75px]">
        <div className="flex w-full items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4 lg:px-6">
          <Avatar className="h-9 w-9 border border-border sm:h-10 sm:w-10 lg:h-11 lg:w-11">
            <AvatarImage
              src={testimonial.avatar.length > 2 ? testimonial.avatar : ""}
            />
            <AvatarFallback className="bg-muted text-muted-foreground text-xs sm:text-sm">
              {testimonial.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col gap-0">
            <h5 className="font-medium text-foreground text-sm sm:text-base lg:text-base">
              {testimonial.name}
            </h5>
            <p className="mt-[-2px] truncate text-muted-foreground text-xs sm:text-sm lg:text-sm">
              {testimonial.profession}
            </p>
          </div>
        </div>
        {testimonial.social && (
          <>
            <div className="h-full w-[1px] bg-border" />
            <div className="flex h-full w-[55px] items-center justify-center sm:w-[65px] lg:w-[75px]">
              {testimonial.social}
            </div>
          </>
        )}
      </div>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-0 top-0 w-2 h-2">
          <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
          <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
        </div>
        <div className="absolute right-0 top-0 w-2 h-2 -scale-x-[1]">
          <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
          <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
        </div>
        <div className="absolute left-0 bottom-0 w-2 h-2 -scale-y-[1]">
          <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
          <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
        </div>
        <div className="absolute right-0 bottom-0 w-2 h-2 -scale-[1]">
          <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
          <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
        </div>
      </div>
    </div>
  );

  if (testimonial.link) {
    return (
      <Link className="block" href={testimonial.link} target="_blank">
        <CardContent />
      </Link>
    );
  }

  return <CardContent />;
}

function SlidingTestimonials({
  testimonials: rowTestimonials,
  reverse = false,
}: {
  testimonials: typeof testimonials;
  reverse?: boolean;
}) {
  const duplicatedTestimonials = new Array(15).fill(rowTestimonials).flat();

  return (
    <div className="group relative flex gap-5 overflow-hidden">
      <div
        className="flex shrink-0 gap-5 group-hover:[animation-play-state:paused]"
        style={{
          animation: reverse
            ? "slide-right 300s linear infinite"
            : "slide-left 300s linear infinite",
        }}
      >
        {duplicatedTestimonials.map((testimonial, index) => (
          <TestimonialCard
            key={`${testimonial.name}-${index}`}
            testimonial={testimonial}
          />
        ))}
      </div>
    </div>
  );
}

export default function Testimonials() {
  return (
    <>
      <style>{`
				@keyframes slide-left {
					from { transform: translateX(0%); }
					to { transform: translateX(-50%); }
				}
				@keyframes slide-right {
					from { transform: translateX(-50%); }
					to { transform: translateX(0%); }
				}
			`}</style>

      <div className="relative w-full">
        {/* Header Section */}
        <div className="text-center mb-8 lg:mb-12 px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-medium leading-tight mb-4">
            What developers are saying
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
            Join thousands of developers who trust Databuddy for their analytics
            needs
          </p>
        </div>

        {/* Testimonials Slider */}
        <div
          className="flex flex-col gap-3 sm:gap-4 lg:gap-5 px-4 sm:px-0"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
          }}
        >
          <SlidingTestimonials
            testimonials={testimonials.slice(
              0,
              Math.floor(testimonials.length / 2),
            )}
          />
          <SlidingTestimonials
            reverse
            testimonials={testimonials.slice(
              Math.floor(testimonials.length / 2),
            )}
          />
        </div>
      </div>
    </>
  );
}
