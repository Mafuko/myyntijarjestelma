import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const badgeVariants = cva('inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      secondary: 'bg-secondary text-secondary-foreground',
      success: 'bg-success text-success-foreground',
    },
  },
  defaultVariants: { variant: 'secondary' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
