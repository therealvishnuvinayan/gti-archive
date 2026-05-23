"use client";

import type { HTMLMotionProps, Transition, Variants } from "framer-motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

const easeOut: Transition["ease"] = [0.22, 1, 0.36, 1];

function getEntranceVariants(
  reduceMotion: boolean,
  y = 10,
): Variants {
  return {
    hidden: {
      opacity: 0,
      y: reduceMotion ? 0 : y,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0.01 : 0.26,
        ease: easeOut,
      },
    },
  };
}

function getStaggerVariants(
  reduceMotion: boolean,
  stagger = 0.05,
  delayChildren = 0.02,
): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : stagger,
        delayChildren: reduceMotion ? 0 : delayChildren,
      },
    },
  };
}

type MotionBoxProps = HTMLMotionProps<"div"> & {
  children: React.ReactNode;
};

type MotionPageProps = MotionBoxProps & {
  y?: number;
};

export function MotionPage({
  children,
  className,
  y = 10,
  ...props
}: MotionPageProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={getEntranceVariants(reduceMotion, y)}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionSection({
  children,
  className,
  y = 8,
  ...props
}: MotionPageProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={getEntranceVariants(reduceMotion, y)}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

type MotionStaggerGroupProps = MotionBoxProps & {
  stagger?: number;
  delayChildren?: number;
};

export function MotionStaggerGroup({
  children,
  className,
  stagger = 0.05,
  delayChildren = 0.02,
  ...props
}: MotionStaggerGroupProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={getStaggerVariants(reduceMotion, stagger, delayChildren)}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

type MotionItemProps = MotionBoxProps & {
  y?: number;
  layout?: boolean;
};

export function MotionItem({
  children,
  className,
  y = 10,
  layout = false,
  ...props
}: MotionItemProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      variants={getEntranceVariants(reduceMotion, y)}
      layout={layout && !reduceMotion}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

type MotionSwapProps = {
  children: React.ReactNode;
  motionKey: string;
  className?: string;
};

export function MotionSwap({
  children,
  motionKey,
  className,
}: MotionSwapProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={motionKey}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: {
            duration: reduceMotion ? 0.01 : 0.2,
            ease: easeOut,
          },
        }}
        exit={{
          opacity: 0,
          y: reduceMotion ? 0 : -4,
          transition: {
            duration: reduceMotion ? 0.01 : 0.14,
            ease: easeOut,
          },
        }}
        className={cn(className)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
