import {
  AnimatePresence,
  LayoutGroup,
  clamp,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from "motion/react"
import type { MotionValue } from "motion/react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react"
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme"
import type { TransitionToken } from "@/components/motion-ui/ui-theme"

/** Which edge a group of actions lives on. */
export type SwipeSide = "left" | "right"

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}

interface SwipeListContextValue {
  /** The id of the row currently held open, or null. */
  openId: string | null
  /** Open the given row. Passing null closes whichever row is open. */
  setOpenId: (id: string | null) => void
}

const SwipeListContext = createContext<SwipeListContextValue | null>(null)

function useSwipeListContext(who: string): SwipeListContextValue {
  const ctx = useContext(SwipeListContext)
  if (!ctx) throw new Error(`${who} must be rendered inside <SwipeActionsList>.`)
  return ctx
}

interface SwipeRowContextValue {
  /** Live swipe progress in [-1, 1]. */
  progress: MotionValue<number>
  /** The snap spring the row follows with. */
  spring: TransitionToken
  /** True when decorative swipe flourishes should be dropped. */
  flat: boolean
  /** Fraction of the row a swipe must clear to commit a full swipe. */
  fullSwipeThreshold: number
  /** Snap the row open on the given side. */
  revealSide: (side: SwipeSide) => void
  /** Snap the row shut. */
  closeRow: () => void
  /** Register a primary action's activate handler for full-swipe commit. */
  registerPrimary: (side: SwipeSide, activate: () => void) => () => void
}

const SwipeRowContext = createContext<SwipeRowContextValue | null>(null)

function useSwipeRowContext(who: string): SwipeRowContextValue {
  const ctx = useContext(SwipeRowContext)
  if (!ctx) throw new Error(`${who} must be rendered inside <SwipeActions>.`)
  return ctx
}

/** What `useSwipeRow` hands a row face. */
export interface SwipeRowState {
  /** Live swipe progress in [-1, 1]. */
  progress: MotionValue<number>
  /** The snap spring the row follows with. */
  spring: TransitionToken
  /** True under reduced motion. */
  flat: boolean
}

/** Read the enclosing row's live swipe state from a face. */
export function useSwipeRow(): SwipeRowState {
  const { progress, spring, flat } = useSwipeRowContext("useSwipeRow")
  return { progress, spring, flat }
}

export interface SwipeActionsListProps {
  /** The `SwipeActions` rows. */
  children?: ReactNode
  /** Merged onto the `<ul>`. */
  className?: string
  /** Inline styles merged onto the `<ul>`. */
  style?: CSSProperties
  /** Forwarded to the `<ul>`. */
  ref?: Ref<HTMLUListElement>
}

/** List container that coordinates single-open state across rows. */
export function SwipeActionsList({
  children,
  className,
  style,
  ref,
}: SwipeActionsListProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const value = useMemo<SwipeListContextValue>(
    () => ({ openId, setOpenId }),
    [openId]
  )

  return (
    <SwipeListContext.Provider value={value}>
      <LayoutGroup>
        <motion.ul
          ref={ref}
          layout
          className={cx("relative w-full overflow-hidden", className)}
          style={style}
        >
          <AnimatePresence mode="popLayout">{children}</AnimatePresence>
        </motion.ul>
      </LayoutGroup>
    </SwipeListContext.Provider>
  )
}

export interface SwipeActionsProps {
  /** Stable id for this row. Required. */
  id: string
  /** The row face that slides over the actions. */
  children?: ReactNode
  /** Actions revealed by swiping the row right. */
  left?: ReactNode
  /** Actions revealed by swiping the row left. */
  right?: ReactNode
  /** Row height in px. Defaults to 88. */
  rowHeight?: number
  /** Fraction of the row a swipe must clear to snap open. Defaults to 0.25. */
  revealThreshold?: number
  /** Fraction of the row a swipe must clear to commit a full swipe. Defaults to 0.8. */
  fullSwipeThreshold?: number
  /** How far the row snaps open, as a fraction of its width. Defaults to 0.5. */
  revealAmount?: number
  /** This row's position in the list, for the entrance stagger. Defaults to 0. */
  index?: number
  /** Drop the bottom divider on the last row. Defaults to false. */
  isLast?: boolean
  /** Merged onto the row `<li>`. */
  className?: string
}

/** One swipeable row with pointer/drag machinery and spring follow. */
export function SwipeActions({
  id,
  children,
  left,
  right,
  rowHeight = 88,
  revealThreshold = 0.25,
  fullSwipeThreshold = 0.8,
  revealAmount = 0.5,
  index = 0,
  isLast = false,
  className,
}: SwipeActionsProps) {
  const theme = useMotionUITheme()
  const snap = theme.transitions.snap
  const enter = useMotionUITransition("ui")
  const motionMode = theme.motionMode
  const still = motionMode === "off"
  const calm = motionMode === "calm"
  const flat = motionMode !== "full"

  const { openId, setOpenId } = useSwipeListContext("SwipeActions")

  const [isSwiping, setIsSwiping] = useState(false)

  const swipeItemRef = useRef<HTMLDivElement>(null)
  const swipeItemWidth = useRef(0)
  const swipeStartX = useRef(0)
  const swipeStartOffset = useRef(0)
  const fullSwipeSnapPosition = useRef<"left" | "right" | null>(null)

  const primaryActivators = useRef<Partial<Record<SwipeSide, () => void>>>({})
  const registerPrimary = useCallback(
    (side: SwipeSide, activate: () => void) => {
      primaryActivators.current[side] = activate
      return () => {
        if (primaryActivators.current[side] === activate) {
          delete primaryActivators.current[side]
        }
      }
    },
    []
  )

  const swipeAmount = useMotionValue(0)
  const swipeAmountSpring = useSpring(swipeAmount, snap)
  const swipeProgress = useTransform(swipeAmount, (value) => {
    const width = swipeItemWidth.current
    if (!width) return 0
    return value / width
  })

  // Document-level listeners only while this row is swiping.
  useEffect(() => {
    if (!isSwiping) return

    const handlePointerMove = (info: PointerEvent) => {
      const itemWidth = swipeItemWidth.current
      if (!itemWidth) return

      const swipeDelta =
        info.clientX - swipeStartX.current + swipeStartOffset.current
      const threshold = itemWidth * fullSwipeThreshold
      const isBeyondThreshold = Math.abs(swipeDelta) > threshold
      const isSwipingLeft = swipeDelta < 0

      if (fullSwipeSnapPosition.current) {
        const isSwipingBackToCentre = Math.abs(swipeDelta) < threshold
        if (isSwipingBackToCentre) {
          fullSwipeSnapPosition.current = null
          swipeAmount.set(swipeDelta)
        } else {
          swipeAmount.set(
            fullSwipeSnapPosition.current === "left" ? -itemWidth : itemWidth
          )
        }
        return
      }

      if (isBeyondThreshold) {
        fullSwipeSnapPosition.current = isSwipingLeft ? "left" : "right"
        swipeAmount.set(isSwipingLeft ? -itemWidth : itemWidth)
      } else {
        swipeAmount.set(clamp(-itemWidth, itemWidth, swipeDelta))
      }
    }

    const handlePointerUp = () => {
      const itemWidth = swipeItemWidth.current
      if (!itemWidth) {
        setIsSwiping(false)
        return
      }

      const currentOffset = swipeAmount.get()
      const snapThreshold = itemWidth * revealThreshold
      let targetOffset = 0
      if (Math.abs(currentOffset) > snapThreshold) {
        targetOffset =
          currentOffset > 0
            ? itemWidth * revealAmount
            : itemWidth * -revealAmount
      }

      const committedSnap = fullSwipeSnapPosition.current
      if (committedSnap) {
        // Swiping left reveals right actions, and vice versa.
        const targetSide: SwipeSide = committedSnap === "left" ? "right" : "left"
        primaryActivators.current[targetSide]?.()
      } else {
        swipeAmount.set(targetOffset)
        setOpenId(targetOffset !== 0 ? id : null)
      }

      setIsSwiping(false)
      fullSwipeSnapPosition.current = null
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
    return () => {
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
    }
  }, [
    isSwiping,
    swipeAmount,
    id,
    fullSwipeThreshold,
    revealThreshold,
    revealAmount,
    setOpenId,
  ])

  useEffect(() => {
    const handleResize = () => {
      const newWidth = swipeItemRef.current?.getBoundingClientRect().width
      if (!newWidth) return

      const currentProgress = swipeItemWidth.current
        ? swipeAmount.get() / swipeItemWidth.current
        : 0
      swipeItemWidth.current = newWidth
      const newOffset = currentProgress * newWidth
      swipeAmount.jump(newOffset)
      swipeAmountSpring.jump(newOffset)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [swipeAmount, swipeAmountSpring])

  useEffect(() => {
    if (openId !== id && !isSwiping) {
      swipeAmount.set(0)
    }
  }, [openId, id, isSwiping, swipeAmount])

  const handlePointerDown = (event: React.PointerEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest("button")) return
    setIsSwiping(true)
    swipeStartX.current = event.clientX
    swipeStartOffset.current = swipeAmount.get()
  }

  const handleBlur = (event: React.FocusEvent<HTMLLIElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      swipeAmount.set(0)
      if (openId === id) setOpenId(null)
    }
  }

  const revealSide = useCallback(
    (side: SwipeSide) => {
      const width = swipeItemWidth.current
      if (!width) return
      const offset = (side === "left" ? 1 : -1) * width * revealAmount
      swipeAmount.set(offset)
      setOpenId(id)
    },
    [revealAmount, swipeAmount, setOpenId, id]
  )

  const closeRow = useCallback(() => {
    swipeAmount.set(0)
    setOpenId(null)
  }, [swipeAmount, setOpenId])

  const rowValue = useMemo<SwipeRowContextValue>(
    () => ({
      progress: swipeProgress,
      spring: snap,
      flat,
      fullSwipeThreshold,
      revealSide,
      closeRow,
      registerPrimary,
    }),
    [
      swipeProgress,
      snap,
      flat,
      fullSwipeThreshold,
      revealSide,
      closeRow,
      registerPrimary,
    ]
  )

  return (
    <SwipeRowContext.Provider value={rowValue}>
      <motion.li
        layout
        className={cx(
          "relative touch-pan-y overflow-hidden bg-card select-none",
          !isLast && "border-b border-border/70",
          className
        )}
        style={{ height: rowHeight }}
        initial={still ? false : { opacity: 0, transform: `translateY(${calm ? 0 : theme.travel.enter}px)` }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        exit={{ opacity: 0 }}
        transition={{
          ...enter,
          delay: still || calm ? 0 : index * theme.stagger.tight,
        }}
        onPointerDown={handlePointerDown}
        onBlur={handleBlur}
      >
        <motion.div
          ref={swipeItemRef}
          className="absolute inset-0 z-10 flex items-center bg-card"
          style={{ x: swipeAmountSpring }}
        >
          {children}
        </motion.div>

        {left && (
          <ActionsGroup side="left" swipeAmount={swipeAmountSpring}>
            {left}
          </ActionsGroup>
        )}
        {right && (
          <ActionsGroup side="right" swipeAmount={swipeAmountSpring}>
            {right}
          </ActionsGroup>
        )}
      </motion.li>
    </SwipeRowContext.Provider>
  )
}

function ActionsGroup({
  swipeAmount,
  side,
  children,
}: {
  swipeAmount: MotionValue<number>
  side: SwipeSide
  children: ReactNode
}) {
  return (
    <motion.div
      className={`absolute flex h-full w-full select-none ${side === "right" ? "left-full" : "right-full"}`}
      style={{ x: swipeAmount }}
    >
      {children}
    </motion.div>
  )
}

export interface SwipeActionProps {
  /** The action glyph. */
  icon: ReactNode
  /** The short action label. */
  label: string
  /** Which edge this action lives on. */
  side: SwipeSide
  /** Whether this is the outer primary action on its side. Defaults to false. */
  primary?: boolean
  /** Fill and text classes for this action's box. */
  fillClassName: string
  /** The button's accessible label. */
  ariaLabel: string
  /** Fired when the action is tapped or a full swipe commits it. */
  onActivate: () => void
}

/** A single revealed action with elastic offset/scale as the swipe crosses. */
export function SwipeAction({
  icon,
  label,
  side,
  primary = false,
  fillClassName,
  ariaLabel,
  onActivate,
}: SwipeActionProps) {
  const { progress, spring, flat, fullSwipeThreshold, revealSide, closeRow, registerPrimary } =
    useSwipeRowContext("SwipeAction")
  const ref = useRef<HTMLDivElement>(null)
  const actionWidth = useRef(0)

  const calculateX = useCallback(
    (value: number) => {
      const width = actionWidth.current
      if (primary) {
        if (Math.abs(value) >= fullSwipeThreshold) return 0
        return ((value * width) / 2) * -1
      }
      return 0
    },
    [primary, fullSwipeThreshold]
  )

  const x = useSpring(0, spring)
  useMotionValueEvent(progress, "change", (value) => {
    x.set(calculateX(value))
  })

  useEffect(() => {
    const updateWidth = () => {
      const width = ref.current?.getBoundingClientRect().width
      if (!width) return
      actionWidth.current = width
      x.jump(calculateX(progress.get()))
    }
    updateWidth()
    window.addEventListener("resize", updateWidth)
    return () => window.removeEventListener("resize", updateWidth)
  }, [progress, x, calculateX])

  useEffect(() => {
    if (!primary) return
    return registerPrimary(side, onActivate)
  }, [primary, side, registerPrimary, onActivate])

  const finalStateOpacity = primary ? 1 : 0
  const rawOpacity = useTransform(
    progress,
    [-1, -0.8, -0.5, -0.25, 0.25, 0.5, 0.8, 1],
    [finalStateOpacity, 1, 1, 0, 0, 1, 1, finalStateOpacity]
  )
  const contentOpacity = useSpring(rawOpacity, spring)

  const rawContentX = useTransform(
    progress,
    [-1, -0.8, -0.5, 0.5, 0.8, 1],
    [0, 16, 0, 0, -16, 0]
  )
  const contentX = useSpring(rawContentX, spring)

  const rawContentScale = useTransform(
    progress,
    [-1, -0.8, 0, 0.8, 1],
    [1, 0.8, 1, 0.8, 1]
  )
  const contentScale = useSpring(rawContentScale, spring)

  const handleClick = () => {
    if (!primary) closeRow()
    onActivate()
  }

  return (
    <motion.div
      ref={ref}
      className={`absolute inset-0 flex ${fillClassName}`}
      style={{
        justifyContent: side === "right" ? "flex-start" : "flex-end",
        x,
      }}
    >
      <div className="flex h-full w-1/4 items-center justify-center">
        <motion.span
          className="block"
          style={{
            opacity: contentOpacity,
            ...(flat
              ? {}
              : {
                  x: contentX,
                  scale: contentScale,
                  transformOrigin: side === "right" ? "right" : "left",
                }),
          }}
        >
          <button
            type="button"
            onClick={handleClick}
            onFocus={() => revealSide(side)}
            aria-label={ariaLabel}
            className={`flex flex-col items-center justify-center gap-1 rounded-md ${FOCUS_RING}`}
          >
            {icon}
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        </motion.span>
      </div>
    </motion.div>
  )
}
