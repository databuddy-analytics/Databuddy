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
    <div className="flex items-center px-5 lg:px-16 xl:px-16">
      <div className="flex items-center justify-center w-full">
        <div className="flex-1 mt-12 mb-16 px-12 lg:px-14">
          <h1 className="text-[32px] font-medium leading-tight mb-12">
            Most Analytics Tools are
          </h1>

          <div className="space-y-2">
            {data.map((item, index) => (
              <motion.div
                key={index}
                variants={titleVariants}
                animate={item.isActive ? "active" : "inactive"}
                className="text-lg font-medium cursor-pointer"
                onClick={() => setCurrentIndex(index)}
              >
                {item.title}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="w-px bg-border h-80 mx-6 lg:mx-8"></div>

        <div className="flex-1 max-w-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              variants={contentVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="text-xs leading-relaxed"
            >
              {data[currentIndex].content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
