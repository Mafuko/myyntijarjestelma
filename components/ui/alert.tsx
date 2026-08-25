import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const alertVariants = cva('relative w-full rounded-lg border p-4 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card text-card-foreground',
      destructive: 'border-destructive/50 bg-destructive/10 text-destructive-text',
      warning: 'border-warning/50 bg-warning/10 text-warning',
      success: 'border-success/50 bg-success/10 text-success',
    },
  },
  defaultVariants: { variant: 'default' },
})

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
))
Alert.displayName = 'Alert'

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn('leading-relaxed', className)} {...props} />
)
AlertDescription.displayName = 'AlertDescription'
