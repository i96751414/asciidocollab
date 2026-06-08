/**
 * AsciiDoCollab logo lockups. `LogoIcon` renders the teal app-icon tile that
 * reads on light and dark headers, `LogoMark` renders a single-colour mark that
 * inherits `currentColor`, and `Logo` renders the horizontal icon-plus-wordmark
 * lockup whose colours follow the theme tokens in light and dark. The wordmark
 * is set in Urbanist 800 and falls back to the UI font when the `--font-urbanist`
 * variable is not loaded.
 */
import * as React from "react";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Teal app-icon tile lockup that stays legible on light and dark headers. */
export function LogoIcon({
  size = 32,
  className,
  title = "AsciiDoCollab",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id="adc-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22899F" />
          <stop offset="1" stopColor="#15606E" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="22" fill="url(#adc-tile)" />
      <rect x="2" y="2" width="96" height="96" rx="22" fill="none" stroke="#fff" strokeOpacity="0.10" strokeWidth="1.5" />
      <path d="M24 3 H76 Q97 3 97 24" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" />
      <g fill="#fff">
        <rect x="23.5" y="29" width="26" height="9" rx="4.5" />
        <rect x="23.5" y="45" width="26" height="9" rx="4.5" opacity="0.78" />
        <rect x="23.5" y="61" width="40" height="9" rx="4.5" opacity="0.78" />
        <circle cx="58" cy="33.5" r="4.5" />
        <rect x="53.5" y="40" width="9" height="15" rx="4.5" />
        <circle cx="72" cy="49.5" r="4.5" />
        <rect x="67.5" y="56" width="9" height="15" rx="4.5" />
      </g>
    </svg>
  );
}

/** Single-colour mark — inherits `currentColor`. Good for monochrome contexts. */
export function LogoMark({
  size = 32,
  className,
  title = "AsciiDoCollab",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={className}
      fill="currentColor"
    >
      <rect x="23.5" y="29" width="26" height="9" rx="4.5" />
      <rect x="23.5" y="45" width="26" height="9" rx="4.5" opacity="0.55" />
      <rect x="23.5" y="61" width="40" height="9" rx="4.5" opacity="0.55" />
      <circle cx="58" cy="33.5" r="4.5" />
      <rect x="53.5" y="40" width="9" height="15" rx="4.5" />
      <circle cx="72" cy="49.5" r="4.5" />
      <rect x="67.5" y="56" width="9" height="15" rx="4.5" />
    </svg>
  );
}

/** Horizontal lockup: icon + "Asciidocollab" wordmark (theme-aware). */
export function Logo({
  className,
  iconSize = 30,
  href,
}: {
  className?: string;
  iconSize?: number;
  href?: string;
}) {
  const inner = (
    <span className={cx("inline-flex items-center gap-2.5 select-none", className)}>
      <LogoIcon size={iconSize} />
      <span
        className="font-extrabold tracking-[-0.02em] leading-none"
        style={{ fontFamily: "var(--font-urbanist), Inter, ui-sans-serif, system-ui, sans-serif", fontSize: iconSize * 0.62 }}
      >
        <span className="text-foreground">Asciido</span>
        <span className="text-primary">collab</span>
      </span>
    </span>
  );
  if (href) {
    return (
      <a href={href} aria-label="AsciiDoCollab" className="inline-flex">
        {inner}
      </a>
    );
  }
  return inner;
}

export default Logo;
