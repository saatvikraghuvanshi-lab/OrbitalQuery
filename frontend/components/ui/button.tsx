import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full border text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-[var(--color-accent)] focus-visible:ring-3 focus-visible:ring-[var(--color-accent-dim)] active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-accent)] text-[var(--color-bg-deep)] hover:bg-[var(--color-accent-hover)] border-transparent",
        outline:
          "border-[var(--color-accent-border)] bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-dim)] hover:text-[var(--color-accent)]",
        secondary:
          "bg-oq-700/40 text-[var(--color-text-secondary)] border border-transparent hover:bg-oq-700/60 hover:text-[var(--color-text-primary)]",
        ghost:
          "hover:bg-oq-700/30 hover:text-[var(--color-text-secondary)] border border-transparent",
        destructive:
          "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
        link: "text-[var(--color-accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-5",
        xs: "h-7 gap-1 rounded-full px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-full px-4 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-6 rounded-full",
        icon: "size-9 rounded-full",
        "icon-xs": "size-7 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
