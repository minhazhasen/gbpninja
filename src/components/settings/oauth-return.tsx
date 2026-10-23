"use client";

// After Google's consent page sends the browser back (src/app/route.ts → /settings?connected=… or ?oauth_error=…):
// show the outcome once, then drop the params from the URL.
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function useOAuthReturn(onConnected?: (what: string) => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const done = useRef(false);
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("oauth_error");
    if (done.current || (!connected && !error)) return;
    done.current = true;
    if (error) toast.error("Couldn't connect Google", { description: error });
    else if (connected === "gmail") toast.success("Gmail connected", { description: "Review request emails now send from your Gmail." });
    else if (connected) onConnected?.(connected);
    const next = new URLSearchParams(params);
    next.delete("connected");
    next.delete("oauth_error");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, router, pathname, onConnected]);
}
