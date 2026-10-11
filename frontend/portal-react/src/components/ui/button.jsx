// shadcn/ui-style owned Button component: Radix Slot + variant classes.
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const variants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4', {
  variants: {
    variant: { outline: 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--hover)]', ghost: 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]' },
    size: { default: 'h-10 px-4', icon: 'size-10 shrink-0' },
  },
  defaultVariants: { variant: 'outline', size: 'default' },
})
export function Button({ className, variant, size, asChild = false, ...props }) {
  const Component = asChild ? Slot : 'button'
  return <Component className={twMerge(clsx(variants({ variant, size }), className))} {...props} />
}
