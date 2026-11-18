"use client";

// Media Library: read the profile's photos and videos from Google again (e.g. after adding some on Google directly).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { reloadMedia } from "@/app/(app)/actions";

export function MediaReload({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("outline", "sm")}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await reloadMedia(locationId);
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reload from Google
    </button>
  );
}
