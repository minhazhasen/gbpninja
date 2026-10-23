"use client";

// One-click fixes on the admin Overview's to-do list.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { reopenOffer, setWorkspaceStatus } from "@/app/admin/actions";

const ACTIONS = {
  reopenOffer: {
    // `id` is "workspaceId|offerId".
    run: (id: string) => reopenOffer(id.split("|")[0], id.split("|")[1]),
    done: "Offer is showing again",
  },
  reactivate: {
    run: (id: string) => setWorkspaceStatus(id, "active"),
    done: "Workspace reactivated",
  },
};

export function QuickAction({ kind, workspaceId, label }: { kind: keyof typeof ACTIONS; workspaceId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("outline", "sm")}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await ACTIONS[kind].run(workspaceId);
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success(ACTIONS[kind].done);
        router.refresh();
      }}
    >
      {busy && <Loader2 className="animate-spin" />} {label}
    </button>
  );
}
