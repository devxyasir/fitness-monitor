'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'session' | 'analytics' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
  /** Renders as a Next.js Link instead of a <button> when provided. */
  href?: string;
}

type ButtonProps = ButtonOwnProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps>;

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white dark:text-canvas hover:brightness-110',
  session: 'bg-session text-white dark:text-canvas hover:brightness-110',
  analytics: 'bg-analytics text-white dark:text-canvas hover:brightness-110',
  ghost: 'bg-panel-2 hover:bg-panel-2/70 text-ink border border-hairline',
  danger: 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className = '', children, disabled, href, ...props }, ref) => {
    const classes = `inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:shadow-focus ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

    if (href) {
      return (
        <Link href={href} className={classes}>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {children}
        </Link>
      );
    }

    return (
      <button ref={ref} disabled={disabled || loading} className={classes} {...props}>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
