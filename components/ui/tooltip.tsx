"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  className?: string
}

const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  side = "top",
  sideOffset = 4,
  className,
}) => {
  const [isVisible, setIsVisible] = React.useState(false)
  const [isAnimating, setIsAnimating] = React.useState(false)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsAnimating(true)
    // Small delay to ensure smooth animation
    setTimeout(() => setIsVisible(true), 10)
  }

  const handleMouseLeave = () => {
    setIsVisible(false)
    timeoutRef.current = setTimeout(() => {
      setIsAnimating(false)
    }, 200) // Match the transition duration
  }

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const getTooltipClasses = () => {
    const baseClasses = "absolute z-[9999] rounded-md border bg-gray-900 px-3 py-1.5 text-sm text-white shadow-lg transition-all duration-200 ease-in-out whitespace-nowrap"
    
    const visibilityClasses = isVisible 
      ? "opacity-100 scale-100" 
      : "opacity-0 scale-95"

    const positionClasses = {
      top: "bottom-full left-1/2 -translate-x-1/2 mb-1",
      bottom: "top-full left-1/2 -translate-x-1/2 mt-1", 
      left: "right-full top-1/2 -translate-y-1/2 mr-1",
      right: "left-full top-1/2 -translate-y-1/2 ml-1"
    }

    return cn(
      baseClasses,
      visibilityClasses,
      positionClasses[side],
      className
    )
  }

  const getArrowClasses = () => {
    const baseClasses = "absolute w-2 h-2 bg-gray-900 border transform rotate-45"
    
    const arrowPositions = {
      top: "top-full left-1/2 -translate-x-1/2 -mt-1 border-r-0 border-b-0",
      bottom: "bottom-full left-1/2 -translate-x-1/2 -mb-1 border-l-0 border-t-0",
      left: "left-full top-1/2 -translate-y-1/2 -ml-1 border-t-0 border-r-0",
      right: "right-full top-1/2 -translate-y-1/2 -mr-1 border-b-0 border-l-0"
    }

    return cn(baseClasses, arrowPositions[side])
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isAnimating && (
        <div
          className={getTooltipClasses()}
          style={{
            [`margin${side === 'top' ? 'Bottom' : side === 'bottom' ? 'Top' : side === 'left' ? 'Right' : 'Left'}`]: `${sideOffset}px`
          }}
        >
          {content}
          <div className={getArrowClasses()} />
        </div>
      )}
    </div>
  )
}

export { Tooltip }