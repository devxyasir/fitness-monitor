import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`bg-panel border border-hairline rounded-lg p-6 ${interactive ? 'cursor-pointer hover:border-hairline/50 hover:-translate-y-0.5 transition-all duration-150' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
