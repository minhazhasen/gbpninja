"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { acceptInvite } from "@/app/(app)/actions";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("default", "default", "mt-5 w-full")}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await acceptInvite(token);
        if (!res.ok) {
          setBusy(false);
          return void toast.error(res.error);
        }
        toast.success("Welcome aboard!");
        router.push("/dashboard");
      }}
    >
      {busy && <Loader2 className="animate-spin" />} Accept invite
    </button>
  );
}
