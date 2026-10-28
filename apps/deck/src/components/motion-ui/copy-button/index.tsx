"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react"
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme"
import type { UITransition } from "@/components/motion-ui/ui-theme"

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

type SwapMotionProps = {
  initial: false | Record<string, string | number>
  animate: Record<string, string | number>
  exit?: Record<string, string | number>
  transition:
    | UITransition
    | {
        duration: number
        ease?: UITransition["ease"] | UITransition["opacity"]["ease"]
      }
}

function buildSwapMotion(
  still: boolean,
  calm: boolean,
  swapTransition: UITransition
): SwapMotionProps {
  const fade = {
    duration: swapTransition.opacity.duration,
    ease: swapTransition.opacity.ease,
  }

  if (still) {
    return {
      initial: false,
      animate: { opacity: 1, filter: "blur(0px)" },
      exit: { opacity: 0 },
      transition: { duration: 0 },
    }
  }

  if (calm) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: fade,
    }
  }

  return {
    initial: { opacity: 0, filter: "blur(4px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
    exit: { opacity: 0, filter: "blur(4px)" },
    transition: { ...swapTransition },
  }
}

/** Copy button shape. */
export type CopyButtonVariant = "label" | "icon"

export interface CopyButtonProps {
  /** Text written to the clipboard on click. */
  value: string
  /** Button shape. Defaults to `"label"`. */
  variant?: CopyButtonVariant
  /** Visible resting label (`"label"` variant only). Default `"Copy"`. */
  children?: ReactNode
  /** Visible confirmed label (`"label"` variant only). Default `"Copied"`. */
  copiedText?: ReactNode
  /** Accessible name while resting. Default `"Copy to clipboard"`. */
  label?: string
  /** Accessible name after copy. Default `"Copied to clipboard"`. */
  copiedLabel?: string
  /** How long the confirmed state holds, in ms. Default `2000`. */
  resetMs?: number
  /** Fired after the clipboard write is attempted. */
  onCopy?: (value: string) => void
  /** Disable the button. */
  disabled?: boolean
  /** Merged onto the button element. */
  className?: string
  /** Ref to the underlying `<button>`. */
  ref?: Ref<HTMLButtonElement>
}

/** Copy-to-clipboard button with confirm swap and aria-live announcement. */
export function CopyButton({
  value,
  variant = "label",
  children = "Copy",
  copiedText = "Copied",
  label = "Copy to clipboard",
  copiedLabel = "Copied to clipboard",
  resetMs = 2000,
  onCopy,
  disabled,
  className,
  ref,
}: CopyButtonProps) {
  const { motionMode } = useMotionUITheme()
  const still = motionMode === "off"
  const calm = motionMode === "calm"
  const motionAllowed = motionMode === "full"
  const snap = useMotionUITransition("snap")
  const swapTransition = useMotionUITransition("ui")
  const [copied, setCopied] = useState(false)
  const resetRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => () => clearTimeout(resetRef.current!), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(value)
    } catch {
      // Sandboxed iframes may deny clipboard access.
    }
    setCopied(true)
    onCopy?.(value)
    clearTimeout(resetRef.current!)
    resetRef.current = setTimeout(() => setCopied(false), resetMs)
  }

  const isIcon = variant === "icon"
  const glyphSize = isIcon ? 15 : 13

  const glyph = copied ? (
    <CheckIcon size={glyphSize} />
  ) : (
    <ClipboardIcon size={glyphSize} />
  )

  const buttonClassName = isIcon
    ? `relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)] hover:bg-muted hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-60 ${FOCUS_RING}${className ? ` ${className}` : ""}`
    : `relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60 ${FOCUS_RING}${className ? ` ${className}` : ""}`

  const swapMotion = buildSwapMotion(still, calm, swapTransition)
  const swapWillChange = calm ? "opacity" : "opacity, filter"

  return (
    <motion.button
      ref={ref}
      type="button"
      className={buttonClassName}
      onClick={handleCopy}
      disabled={disabled}
      aria-label={copied ? copiedLabel : label}
      layout={!isIcon && motionAllowed ? true : undefined}
      whileTap={motionAllowed ? { scale: 0.94 } : undefined}
      transition={{ ...snap }}
    >
      {isIcon && (
        <span
          className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
          aria-hidden="true"
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? "copied" : "idle"}
          className={
            isIcon
              ? `flex items-center${copied ? " text-foreground" : ""}`
              : "flex items-center gap-1.5"
          }
          layout={!isIcon && motionAllowed ? "position" : undefined}
          style={{ willChange: still ? undefined : swapWillChange }}
          {...swapMotion}
        >
          {glyph}
          {!isIcon && (copied ? copiedText : children)}
        </motion.span>
      </AnimatePresence>
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </motion.button>
  )
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

function ClipboardIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  )
}
