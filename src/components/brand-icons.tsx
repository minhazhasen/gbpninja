// Brand glyphs: Google, Gmail, Search Console (brand colours are the one exception to theme tokens).
import { GoogleIcon } from "@/components/marketing/channel-icon";

export { GoogleIcon };

export function GmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M1.6 20h3.8v-9.2L0 6.8v11.6c0 .9.7 1.6 1.6 1.6Z" />
      <path fill="#34A853" d="M18.6 20h3.8c.9 0 1.6-.7 1.6-1.6V6.8l-5.4 4Z" />
      <path fill="#FBBC04" d="M18.6 3.9v6.9l5.4-4V4.6c0-2-2.3-3.1-3.9-1.9Z" />
      <path fill="#EA4335" d="M5.4 10.8V3.9L12 8.8l6.6-4.9v6.9L12 15.7Z" />
      <path fill="#C5221F" d="M0 4.6v2.2l5.4 4V3.9L3.9 2.7C2.3 1.5 0 2.6 0 4.6Z" />
    </svg>
  );
}


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


