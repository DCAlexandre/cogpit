import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-mono text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 select-none active:translate-y-px',
  {
    variants: {
      variant: {
        default:
          'border border-primary/50 bg-gradient-to-b from-[hsl(var(--accent))] to-[hsl(var(--primary))] text-primary-foreground shadow-glow-sm hover:shadow-glow hover:brightness-105',
        secondary: 'border border-border bg-secondary text-secondary-foreground hover:border-primary/40 hover:text-primary',
        outline: 'border border-border bg-transparent hover:border-primary/50 hover:bg-primary/5 hover:text-primary',
        ghost: 'hover:bg-muted hover:text-foreground',
        destructive:
          'border border-destructive/50 bg-destructive text-destructive-foreground hover:brightness-110',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
)
Button.displayName = 'Button'

export { buttonVariants }
