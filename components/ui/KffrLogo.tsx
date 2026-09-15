import Image from "next/image";

type KffrLogoProps = {
  alt?: string;
  className?: string;
  variant?: "full" | "compact" | "icon";
};

const LOGO_DIMENSIONS = {
  compact: { height: 793, width: 1983 },
  full: { height: 1254, width: 1254 },
  icon: { height: 1254, width: 1254 },
} as const;

export function KffrLogo({ alt = "KFFR Contrée", className = "", variant = "full" }: KffrLogoProps) {
  const dimensions = LOGO_DIMENSIONS[variant];

  if (variant === "icon") {
    return (
      <span className={`coinche-brand-logo coinche-brand-logo--icon ${className}`}>
        <Image
          alt={alt}
          className="h-full w-full object-contain"
          height={dimensions.height}
          priority
          src="/brand/kffr-icon-master.png"
          width={dimensions.width}
        />
      </span>
    );
  }

  const isCompact = variant === "compact";
  const darkSource = isCompact ? "/brand/kffr-wordmark-light.png" : "/brand/kffr-logo-dark.png";
  const lightSource = isCompact ? "/brand/kffr-wordmark-light.png" : "/brand/kffr-logo-light.png";

  return (
    <span className={`coinche-brand-logo coinche-brand-logo--${variant} ${className}`}>
      <Image
        alt={alt}
        className="coinche-brand-logo__image coinche-brand-logo__image--dark h-full w-full object-contain"
        height={dimensions.height}
        priority
        src={darkSource}
        width={dimensions.width}
      />
      <Image
        alt=""
        aria-hidden="true"
        className="coinche-brand-logo__image coinche-brand-logo__image--light h-full w-full object-contain"
        height={dimensions.height}
        priority
        src={lightSource}
        width={dimensions.width}
      />
    </span>
  );
}
