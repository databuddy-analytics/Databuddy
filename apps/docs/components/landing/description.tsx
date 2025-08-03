"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "motion/react";

const analyticsData = [
  {
    title: "Bloated and Creepy",
    content:
      "Google Analytics tracks everything, slows down your site, and requires cookie banners that hurt conversion rates.",
    isActive: true,
  },
  {
    title: "Minimal but useless",
    content:
      "Simple analytics tools give you basic metrics but lack the depth needed for meaningful business insights.",
    isActive: false,
  },
  {
    title: "Complex Product Analysis",
    content:
      "Enterprise tools overwhelm you with features you don't need while hiding the metrics that actually matter.",
    isActive: false,
  },
];

export const Description = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [data, setData] = useState(analyticsData);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % data.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [data.length]);

  useEffect(() => {
    setData((prevData) =>
      prevData.map((item, index) => ({
        ...item,
        isActive: index === currentIndex,
      })),
    );
  }, [currentIndex]);

  const titleVariants: Variants = {
    active: {
      opacity: 1,
      color: "var(--color-foreground)",
      transition: { duration: 0.3 },
    },
    inactive: {
      opacity: 0.4,
      color: "var(--color-muted-foreground)",
      transition: { duration: 0.3 },
    },
  };

  const contentVariants: Variants = {
    enter: {
      opacity: 0,
      y: 20,
    },
    center: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: {
        duration: 0.3,
        ease: "easeIn",
      },
    },
  };

  return (
    <div className="w-full">
      {/* Mobile Layout */}
      <div className="block lg:hidden">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-medium leading-tight mb-8">
            Most Analytics Tools are
          </h2>
        </div>

        {/* Mobile Navigation Dots */}
        <div className="flex justify-center space-x-2 mb-8">
          {data.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? "bg-foreground scale-125"
                  : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Mobile Active Title */}
        <div className="text-center mb-6">
          <h3 className="text-xl font-medium text-foreground">
            {data[currentIndex].title}
          </h3>
        </div>

        {/* Mobile Content */}
        <div className="min-h-[80px] flex items-center justify-center px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              variants={contentVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="text-sm sm:text-base leading-relaxed text-center text-muted-foreground max-w-md"
            >
              {data[currentIndex].content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex items-center justify-center w-full">
        <div className="flex items-center justify-center w-full max-w-6xl">
          {/* Left Column - Titles */}
          <div className="flex-1 px-8 xl:px-12">
            <h2 className="text-2xl xl:text-3xl font-medium leading-tight mb-8 xl:mb-12">
              Most Analytics Tools are
            </h2>

            <div className="space-y-3 xl:space-y-4">
              {data.map((item, index) => (
                <motion.div
                  key={index}
                  variants={titleVariants}
                  animate={item.isActive ? "active" : "inactive"}
                  className="text-lg xl:text-xl font-medium cursor-pointer transition-colors duration-200 hover:opacity-80"
                  onClick={() => setCurrentIndex(index)}
                >
                  {item.title}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-border h-60 xl:h-80 mx-6 xl:mx-8 flex-shrink-0"></div>

          {/* Right Column - Content */}
          <div className="flex-1 px-8 xl:px-12">
            <div className="min-h-[120px] xl:min-h-[160px] flex items-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  variants={contentVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="text-sm xl:text-base leading-relaxed text-muted-foreground max-w-md"
                >
                  {data[currentIndex].content}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
