"use client";

// Settings → Data sources: connect Google Search Console (free rankings) and choose each location's website property.
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Globe, Loader2, MoreHorizontal, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { GoogleIcon, SearchConsoleIcon } from "@/components/brand-icons";
import { Card, PanelHeader, buttonClass } from "@/components/ui";
import { Menu, Modal, SelectBox, useConfirm } from "@/components/ui-client";
import { ACCOUNT_ROW, AccountColumns, StatusPill } from "./account-grid";
import { connectSearchConsole, disconnectSearchConsole, listSearchConsoleProperties, saveSearchConsoleSites } from "@/app/(app)/actions";
import type { SearchConsoleConnection, SearchConsoleProperty } from "@/lib/gbp/types";

const PERMISSION: Record<SearchConsoleProperty["permission"], string> = { siteOwner: "Owner", siteFullUser: "Full access", siteRestrictedUser: "Restricted" };
/** "sc-domain:example.com" → "example.com (all of the domain)" */
export const propertyLabel = (siteUrl: string) => (siteUrl.startsWith("sc-domain:") ? `${siteUrl.slice(10)} · whole domain` : siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""));

/** Google-style sign-in button. */
export function GoogleConnectButton({ onClick, busy, label = "Connect with Google", disabled }: { onClick: () => void; busy?: boolean; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex h-9 shrink-0 items-center gap-2.5 rounded-lg border border-input bg-card px-3.5 text-sm font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
      {label}
    </button>
  );
}

export function SearchConsoleCard({
  connection,
  locations,
  available,
  demo,
}: {
  connection: SearchConsoleConnection;
  locations: { id: string; title: string; websiteUri?: string }[];
  available: boolean;
  demo: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const connected = connection.status === "connected";
  // Back from Google's consent page (?pick=searchconsole): open the website picker once.
  const params = useSearchParams();
  const pathname = usePathname();
  useEffect(() => {
    if (params.get("pick") !== "searchconsole" || !connected) return;
    setPicking(true);
    const next = new URLSearchParams(params);
    next.delete("pick");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}#search-console`, { scroll: false });
  }, [params, connected, pathname, router]);
  const linked = locations.filter((l) => connection.sites[l.id]);

  const connect = async () => {
    setBusy("connect");
    const res = await connectSearchConsole();
    if (res.ok && res.redirect) return void window.location.assign(res.redirect);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (demo) toast.message("Demo: signed in with Google", { description: "In live mode this opens Google's sign-in to allow read-only Search Console access." });
    router.refresh();
    setPicking(true);
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Google Search Console?",
      description: "The Ranking page stops updating until you reconnect.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("disconnect");
    const res = await disconnectSearchConsole();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Search Console disconnected");
    router.refresh();
  };

  const menu = connected && (
    <Menu
      label="Search Console actions"
      trigger={(p) => (
        <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label="Search Console actions">
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </button>
      )}
      items={[
        { label: "Reconnect", icon: RefreshCw, onSelect: connect },
        { label: "Disconnect", icon: Unplug, onSelect: disconnect, tone: "danger", separator: true },
      ]}
    />
  );
  const missing = locations.length - linked.length;

  return (
    <Card id="search-console" className="scroll-mt-20 overflow-hidden">
      {dialog}
      <PanelHeader title="Data sources" meta="ranking data" />
      <AccountColumns third="Websites" />
      <ul>
        <li className={ACCOUNT_ROW}>
          <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background">
              <SearchConsoleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold">
                <span className="truncate">Google Search Console</span>
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">Free</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {connected
                  ? [connection.account, connection.connectedAt && `connected ${formatDistanceToNow(parseISO(connection.connectedAt), { addSuffix: true })}`].filter(Boolean).join(" · ")
                  : "Free rankings: average position, clicks and impressions per search. Read-only."}
              </p>
            </div>
          </div>
          <div className="flex justify-end lg:hidden">{menu}</div>

          <div className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[52px] lg:contents">
            <span className="lg:flex">
              <StatusPill tone={connected ? (missing ? "warning" : "success") : "muted"} label={connected ? (missing ? "Choose websites" : "Connected") : "Not connected"} />
            </span>
            <span className="min-w-0 text-sm lg:block">
              {connected ? (
                <span
                  className="flex min-w-0 items-center gap-1.5"
                  title={locations.map((l) => `${l.title}: ${connection.sites[l.id] ? propertyLabel(connection.sites[l.id]) : "no website"}`).join("\n")}
                >
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="whitespace-nowrap">
                    <span className="font-semibold tabular-nums">{linked.length}</span> of {locations.length} locations
                  </span>
                  {missing > 0 && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />}
                </span>
              ) : (
                <span className="hidden text-muted-foreground lg:inline">—</span>
              )}
            </span>
            <span className="ml-auto lg:ml-0 lg:flex lg:justify-end">
              {!connected ? (
                available ? (
                  <GoogleConnectButton onClick={connect} busy={busy === "connect"} />
                ) : (
                  <button type="button" className={buttonClass("outline", "sm")} disabled title="Google sign-in isn't set up yet — contact support">
                    Not available yet
                  </button>
                )
              ) : (
                <button type="button" className={buttonClass(missing ? "default" : "outline", "sm")} onClick={() => setPicking(true)}>
                  {missing ? "Choose websites" : "Change websites"}
                </button>
              )}
            </span>
          </div>
          <div className="hidden justify-end lg:flex">{menu}</div>
        </li>
      </ul>
      <PropertyPicker open={picking} onClose={() => setPicking(false)} locations={locations} current={connection.sites} onSaved={() => router.refresh()} />
    </Card>
  );
}

/** After sign-in: match each location to one of the Search Console properties the account can see. */
function PropertyPicker({
  open,
  onClose,
  locations,
  current,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  locations: { id: string; title: string; websiteUri?: string }[];
  current: Record<string, string>;
  onSaved: () => void;
}) {
  const [props, setProps] = useState<SearchConsoleProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProps(null);
    setError(null);
    setPick({ ...current });
    // Use the saved choices from the server: right after connecting, `current` can still be the pre-connect props.
    listSearchConsoleProperties().then((r) => {
      if (!r.ok) return setError(r.error);
      setProps(r.properties);
      setPick({ ...r.sites });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setSaving(true);
    const res = await saveSearchConsoleSites(Object.fromEntries(locations.map((l) => [l.id, pick[l.id] || null])));
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Search Console websites saved");
    onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Choose a website for each location" className="h-auto max-h-[92dvh] sm:max-w-lg">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-sm text-muted-foreground">Pick the Search Console property for each business&apos;s website. Rankings on the Ranking page come from it.</p>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !props ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-3">
            {locations.map((l) => (
              <li key={l.id}>
                <p className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{l.title}</span>
                  {l.websiteUri && <span className="truncate text-xs text-muted-foreground">{l.websiteUri.replace(/^https?:\/\//, "")}</span>}
                </p>
                <SelectBox
                  value={pick[l.id] ?? ""}
                  onChange={(v) => setPick((p) => ({ ...p, [l.id]: v }))}
                  label={`Search Console property for ${l.title}`}
                  className="[&_select]:h-10"
                  options={[{ value: "", label: "No website" }, ...props.map((p) => ({ value: p.siteUrl, label: `${propertyLabel(p.siteUrl)} (${PERMISSION[p.permission]})` }))]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className={buttonClass()} onClick={save} disabled={saving || !props}>
          {saving && <Loader2 className="animate-spin" />} Save
        </button>
      </div>
    </Modal>
  );
}
