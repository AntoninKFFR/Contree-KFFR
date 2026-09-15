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
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-white/65 transition hover:border-white/20 hover:bg-white/[0.1] hover:text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${className}`}
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
