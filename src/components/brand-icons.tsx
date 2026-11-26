// Brand glyphs: Google, Search Console (brand colours are the one exception to theme tokens).
import { GoogleIcon } from "@/components/marketing/channel-icon";

export { GoogleIcon };

/** Google Search Console glyph (simplified). */
export function SearchConsoleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="3" width="20" height="15" rx="2.5" fill="#E8F0FE" stroke="#4285F4" strokeWidth="1.5" />
      <rect x="6" y="11" width="2.6" height="4" rx=".6" fill="#34A853" />
      <rect x="10.7" y="8" width="2.6" height="7" rx=".6" fill="#FBBC05" />
      <rect x="15.4" y="6" width="2.6" height="9" rx=".6" fill="#EA4335" />
      <path d="M8 21h8" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


