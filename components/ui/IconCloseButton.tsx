"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type IconCloseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
};

export const IconCloseButton = forwardRef<HTMLButtonElement, IconCloseButtonProps>(
  function IconCloseButton({ className = "", label, type = "button", ...props }, ref) {
    return (
      <button
        {...props}
        aria-label={label}
        className={`coinche-icon-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${className}`}
        ref={ref}
        type={type}
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    );
  },
);
