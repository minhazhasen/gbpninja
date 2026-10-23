import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GBPNinja", template: "%s · GBPNinja" },
  description: "GBPNinja: manage Google Business Profiles — performance, reviews, content, competitors and audits.",
};

// viewport-fit=cover lets the bottom tab bar sit above the iPhone home indicator (safe-area insets).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the saved theme before paint so there is no light/dark flash.
const themeScript = `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Toaster
          position="top-center"
          toastOptions={{ classNames: { toast: "rounded-xl! border! border-border! bg-popover! text-foreground! shadow-elegant! font-sans!", description: "text-muted-foreground!", actionButton: "bg-primary! text-primary-foreground!" } }}
        />
      </body>
    </html>
  );
}
