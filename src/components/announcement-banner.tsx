"use client";

// Platform announcement shown above the app's top bar (set in Admin → Announcements). Dismissed per browser, per announcement.
import { useEffect, useState } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { AnnouncementTone } from "@/lib/platform/types";
import { cn } from "@/lib/utils";

const KEY = "gbp-dismissed-announcement";
export const ANNOUNCEMENT_TONE: Record<AnnouncementTone, { cls: string; icon: React.ElementType; label: string }> = {
  info: { cls: "bg-info/10 text-info border-info/20", icon: Info, label: "Info" },
  warning: { cls: "bg-warning/10 text-warning border-warning/20", icon: TriangleAlert, label: "Warning" },
  success: { cls: "bg-success/10 text-success border-success/20", icon: CircleCheck, label: "Good news" },
};

export function AnnouncementBanner({ announcement, preview }: { announcement: { id: string; message: string; tone: AnnouncementTone; href?: string | null }; preview?: boolean }) {
  const [hidden, setHidden] = useState(!preview);
  useEffect(() => {
    if (preview) return;
    try {
      setHidden(localStorage.getItem(KEY) === announcement.id);
    } catch {
      setHidden(false);
    }
  }, [announcement.id, preview]);
  if (hidden) return null;
  const t = ANNOUNCEMENT_TONE[announcement.tone];
  return (
    <div role="status" className={cn("flex items-start gap-2.5 border-b px-4 py-2 text-sm lg:px-6", t.cls, preview && "rounded-lg border")}>
      <t.icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-foreground">
        {announcement.message}
        {announcement.href && (
          <a href={announcement.href} target="_blank" rel="noreferrer" className="ml-1.5 font-semibold underline underline-offset-2">
            Learn more
          </a>
        )}
      </p>
      {!preview && (
        <button
          type="button"
          aria-label="Dismiss announcement"
          className="-my-0.5 rounded-md p-0.5 opacity-70 hover:opacity-100"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(KEY, announcement.id);
            } catch {}
          }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
