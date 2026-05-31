import { LabelHTMLAttributes, forwardRef } from 'react'
import { cn } from '@renderer/lib/utils'

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-xs font-medium text-muted-foreground', className)} {...props} />
  )
)
Label.displayName = 'Label'
