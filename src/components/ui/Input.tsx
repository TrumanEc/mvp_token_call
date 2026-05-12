import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-win-text-secondary mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`
            w-full px-3 py-2 border rounded-lg shadow-sm transition-colors
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
            ${error ? 'border-win-error' : 'border-win-hover'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-win-error">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
