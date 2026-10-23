import { CHANNEL_LABEL, type Channel } from "@/lib/posts";
import { cn } from "@/lib/utils";

/** Small brand glyphs (brand colours are the one exception to theme tokens). */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.27a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.97 11.97 0 0 0 1.27 6.6l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path fill="#fff" d="M13.4 24v-8.4h2.8l.4-3.3h-3.2v-2.1c0-.95.27-1.6 1.63-1.6h1.74V5.65a23 23 0 0 0-2.54-.13c-2.51 0-4.23 1.53-4.23 4.35v2.43H7.2v3.3H10V24Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#E4405F" />
      <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="1.8" />
      <circle cx="16.3" cy="7.7" r="1.1" fill="#fff" />
    </svg>
  );
}

export function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path fill="#fff" d="M7.1 9.6h2.6V18H7.1zM8.4 5.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M11.4 9.6h2.5v1.15h.04c.35-.66 1.2-1.36 2.47-1.36 2.64 0 3.13 1.74 3.13 4V18h-2.6v-4.06c0-.97-.02-2.22-1.35-2.22-1.35 0-1.56 1.06-1.56 2.15V18h-2.6z" />
    </svg>
  );
}

export function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#000" />
      <path fill="#fff" d="M13.3 10.9 18.4 5h-1.2l-4.4 5.1L9.3 5H5.2l5.3 7.7L5.2 19h1.2l4.6-5.4 3.7 5.4h4.1zm-1.6 1.9-.5-.8-4.3-6.1h1.8l3.5 5 .5.8 4.5 6.4h-1.8z" />
    </svg>
  );
}

export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  const cls = cn("h-4 w-4 shrink-0", className);
  if (channel === "google") return <GoogleIcon className={cls} />;
  if (channel === "facebook") return <FacebookIcon className={cls} />;
  if (channel === "linkedin") return <LinkedInIcon className={cls} />;
  if (channel === "x") return <XIcon className={cls} />;
  return <InstagramIcon className={cls} />;
}

/** Overlapping row of channel glyphs. */
export function ChannelStack({ channels, className, size = "h-3.5 w-3.5" }: { channels: Channel[]; className?: string; size?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center -space-x-1", className)} aria-label={channels.map((c) => CHANNEL_LABEL[c]).join(", ")}>
      {channels.map((c) => (
        <span key={c} className="rounded-full bg-card ring-2 ring-card">
          <ChannelIcon channel={c} className={size} />
        </span>
      ))}
    </span>
  );
}
