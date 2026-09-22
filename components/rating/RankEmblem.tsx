"use client";

import Image from "next/image";
import { useState } from "react";
import { getRatingPresentation } from "@/lib/rating/presentation";

const SIZE = {
  xs: { pixels: 32, sizes: "32px", className: "h-8 w-8" },
  sm: { pixels: 46, sizes: "46px", className: "h-[46px] w-[46px]" },
  md: { pixels: 68, sizes: "68px", className: "h-[68px] w-[68px]" },
  lg: { pixels: 144, sizes: "144px", className: "h-36 w-36" },
  xl: { pixels: 208, sizes: "(max-width: 640px) 144px, 208px", className: "h-36 w-36 sm:h-[208px] sm:w-[208px]" },
} as const;

export type RankEmblemProps = {
  rating: number;
  size?: keyof typeof SIZE;
  showDivision?: boolean;
  showLabel?: boolean;
  className?: string;
  decorative?: boolean;
};

export function RankEmblem({
  rating,
  size = "md",
  showDivision = true,
  showLabel = false,
  className = "",
  decorative = false,
}: RankEmblemProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const presentation = getRatingPresentation(rating);
  const dimensions = SIZE[size];

  return (
    <div className={`coinche-rank-emblem inline-flex min-w-0 flex-col items-center text-center ${className}`} data-rank-family={presentation.family}>
      <div className="relative flex items-center justify-center">
        {!imageFailed ? (
          <Image
            alt={decorative || showLabel ? "" : `Rang ${presentation.familyLabel}`}
            className={`coinche-rank-emblem-image ${dimensions.className} object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.24)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02]`}
            height={dimensions.pixels}
            onError={() => setImageFailed(true)}
            sizes={dimensions.sizes}
            src={presentation.imageSrc}
            width={dimensions.pixels}
          />
        ) : (
          <span aria-hidden="true" style={{ height: dimensions.pixels, width: dimensions.pixels }} />
        )}
        {showDivision ? (
          <span className="absolute -bottom-1 left-1/2 min-w-6 -translate-x-1/2 rounded-full border border-[#d8c48f]/45 bg-[#07150f]/90 px-1.5 py-0.5 text-[9px] font-black leading-none tracking-[0.12em] text-[#f0dfb1] shadow-md sm:text-[10px]">
            {presentation.division}
          </span>
        ) : null}
      </div>
      {showLabel ? <span className="mt-2 text-sm font-bold text-[var(--text-primary)]">{presentation.label}</span> : null}
    </div>
  );
}
