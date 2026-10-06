import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider leading-none transition-colors',
  {
    variants: {
      variant: {
        default: 'border-brass/40 bg-brass/10 text-brass',
        muted: 'border-border bg-muted text-muted-foreground',
        accent: 'border-patina/40 bg-patina/10 text-patina',
        outline: 'border-border text-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
