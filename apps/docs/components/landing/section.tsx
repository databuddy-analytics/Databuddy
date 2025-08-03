import type React from "react";
import SectionSvg from "./section-svg";

const Section = ({
  className,
  id,
  crosses,
  crossesOffset,
  customPaddings,
  children,
}: {
  className?: string;
  id: string;
  crosses?: boolean;
  crossesOffset?: string;
  customPaddings?: boolean;
  children: React.ReactNode;
}) => {
  return (
    <div
      id={id}
      className={`
        relative
        w-full
        ${customPaddings ? "" : "py-8 sm:py-12 lg:py-16 xl:py-20"}
        ${className || ""}
      `}
    >
      {children}

      {/* Left border line - hidden on mobile, visible on larger screens */}
      <div className="hidden absolute top-0 left-4 w-[0.0625rem] h-[calc(100%_+_30px)] dark:bg-border bg-stone-200 pointer-events-none sm:left-6 lg:block lg:left-16 xl:left-16" />

      {/* Right border line - hidden on mobile, visible on larger screens */}
      <div className="hidden absolute top-0 right-4 w-[0.0625rem] h-[calc(100%_+_30px)] dark:bg-border bg-stone-200 pointer-events-none sm:right-6 lg:block lg:right-14 xl:right-14" />

      {crosses && (
        <>
          <SectionSvg crossesOffset={crossesOffset} />
        </>
      )}
    </div>
  );
};

export default Section;
