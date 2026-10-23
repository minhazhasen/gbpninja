"use client";

// Settings → connected accounts, ported from TasksBook CRM (src/pages/marketing/MarketingConnections.tsx), plus X.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Check, Link2, Loader2, MapPin, MoreHorizontal, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { Card, PanelHeader, StatStrip, buttonClass } from "@/components/ui";
import { Menu, Modal, useConfirm } from "@/components/ui-client";
import { ChannelIcon } from "@/components/marketing/channel-icon";
import { connectChannel, disconnectChannel, listConnectionOptions, selectConnectionTargets, syncConnections } from "@/app/(app)/actions";
import type { Connection, ConnectionOption, SearchConsoleConnection } from "@/lib/gbp/types";
import { SearchConsoleCard } from "./search-console-card";
import { useOAuthReturn } from "./oauth-return";
import { ACCOUNT_ROW, AccountColumns, BrandConnectButton, StatusPill } from "./account-grid";
import { CHANNELS, CONNECT_LABEL, type Channel } from "@/lib/posts";
import { cn } from "@/lib/utils";

const ago = (iso?: string | null) => (iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true }) : null);
/** Fits a stat tile: "Just now", "5 min ago", "3 h ago", "2 d ago". */
function shortAgo(iso: string) {
  const min = Math.round((Date.now() - parseISO(iso).getTime()) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

/** What each connection unlocks, shown while it's not connected. */
const PURPOSE: Record<Channel, string> = {
  google: "Reviews, performance, posts and profile edits for your locations",
  facebook: "Publish posts to your Facebook Page",
  instagram: "Publish to an Instagram business account linked to a Facebook Page",
  linkedin: "Post to your LinkedIn profile or Company Page",
  x: "Post to your X account",
};
const PICK_TITLE: Record<Channel, string> = {
  google: "Business locations",
  facebook: "Choose a Facebook Page",
  instagram: "Choose an Instagram account",
  linkedin: "Post on LinkedIn as",
  x: "X account",
};
const PENDING_STATUS: Record<Channel, string> = {
  google: "Choose locations",
  facebook: "Choose a page",
  instagram: "Choose an account",
  linkedin: "Choose an account",
  x: "Choose an account",
};
const PICK_LABEL: Record<Channel, string> = { google: "Choose locations", facebook: "Choose page", instagram: "Choose account", linkedin: "Choose account", x: "Choose account" };

const isLive = (c?: Connection) => !!c && c.status === "connected" && (!c.expiresAt || new Date(c.expiresAt).getTime() > Date.now());

export function ConnectionsBoard({
  connections,
  available,
  locationCount,
  demo,
  searchConsole,
}: {
  connections: Connection[];
  available: Record<string, boolean>;
  locationCount: number;
  demo: boolean;
  /** Google Search Console (free rankings). */
  searchConsole: { connection: SearchConsoleConnection; locations: { id: string; title: string; websiteUri?: string }[]; available: boolean };
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<Channel | null>(null);
  // Back from Google's consent page: pick the Business Profile locations to manage.
  useOAuthReturn(
    useCallback((what: string) => {
      if (what !== "google") return;
      toast.success("Google account connected", { description: "Choose the Business Profiles to manage." });
      setPicker("google");
    }, []),
  );
  const byId = Object.fromEntries(connections.map((c) => [c.channel, c])) as Partial<Record<Channel, Connection>>;
  const live = CHANNELS.filter((c) => isLive(byId[c]));
  const lastSync = connections
    .map((c) => c.lastSyncAt)
    .filter(Boolean)
    .sort()
    .pop();

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong");
      return false;
    }
    if (ok) toast.success(ok);
    router.refresh();
    return true;
  };

  const connect = async (ch: Channel) => {
    setBusy(`c-${ch}`);
    const res = await connectChannel(ch);
    if (res.ok && res.redirect) return void window.location.assign(res.redirect);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (demo) toast.message(`Demo: signed in to ${CONNECT_LABEL[ch]}`, { description: "In live mode this opens the network's sign-in page." });
    router.refresh();
    if (res.needsSelection) setPicker(ch);
    else toast.success(`${CONNECT_LABEL[ch]} connected`);
  };

  const disconnect = async (ch: Channel) => {
    const ok = await confirm({
      title: `Disconnect ${CONNECT_LABEL[ch]}?`,
      description:
        ch === "facebook"
          ? "Instagram is published through the Facebook Page and will be disconnected too. Scheduled posts for these channels will fail until you reconnect."
          : ch === "google"
            ? "Reviews, performance and profile edits stop syncing until you reconnect."
            : "Scheduled posts for this channel will fail until you reconnect.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (ok) await run(`dc-${ch}`, () => disconnectChannel(ch), "Disconnected");
  };

  return (
    <div className="space-y-5">
      <StatStrip
        items={[
          {
            label: "Connected accounts",
            value: `${live.length}/${CHANNELS.length}`,
            hint: live.length === CHANNELS.length ? "Everything connected" : `${CHANNELS.length - live.length} not connected`,
          },
          {
            label: "Google locations",
            value: isLive(byId.google) ? (byId.google?.targets.length ?? 0) : 0,
            hint: isLive(byId.google) ? `${locationCount} shown in the app` : "Google not connected",
          },
          { label: "Last sync", value: lastSync ? shortAgo(lastSync) : "—", hint: "Reviews, metrics and posts" },
          { label: "Data", value: demo ? "Demo" : "Live", hint: demo ? "Sample data — nothing is sent" : "Connected to Google", alert: demo },
        ]}
      />

      <Card className="overflow-hidden">
        <PanelHeader
          title="Accounts"
          meta={`${live.length} of ${CHANNELS.length} connected`}
          action={
            live.length > 0 && (
              <button type="button" className={buttonClass("outline", "sm")} disabled={busy === "sync"} onClick={() => run("sync", () => syncConnections(), "All accounts synced")}>
                {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync all
              </button>
            )
          }
        />
        <AccountColumns />
        <ul className="divide-y">
          {CHANNELS.map((ch) => (
            <ConnectionRow
              key={ch}
              channel={ch}
              conn={byId[ch]}
              available={!!available[ch]}
              busy={busy}
              onConnect={() => connect(ch)}
              onPick={() => setPicker(ch)}
              onDisconnect={() => disconnect(ch)}
              onSync={() => run(`s-${ch}`, () => syncConnections(ch), `${CONNECT_LABEL[ch]} synced`)}
            />
          ))}
        </ul>
      </Card>

      <SearchConsoleCard {...searchConsole} demo={demo} />

      <TargetPicker channel={picker} current={picker ? (byId[picker]?.targets.map((t) => t.id) ?? []) : []} onClose={() => setPicker(null)} onSaved={() => router.refresh()} />
      {dialog}
    </div>
  );
}

/** What a connection is linked to: "3 profiles", a Page name, an account handle. */
const TARGET_NOUN: Record<Channel, [string, string]> = {
  google: ["profile", "profiles"],
  facebook: ["Page", "Pages"],
  instagram: ["account", "accounts"],
  linkedin: ["account", "accounts"],
  x: ["account", "accounts"],
};
const NETWORK: Record<Channel, string> = { google: "Google", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X" };
const CHANGE_LABEL: Record<Channel, string | null> = { google: "Locations", facebook: "Page", instagram: "Account", linkedin: "Account", x: null };

/** One line per account: logo + name, status, what's linked, Change, and ⋯ (Reconnect / Disconnect). */
function ConnectionRow({
  channel,
  conn,
  available,
  busy,
  onConnect,
  onPick,
  onDisconnect,
  onSync,
}: {
  channel: Channel;
  conn?: Connection;
  available: boolean;
  busy: string | null;
  onConnect: () => void;
  onPick: () => void;
  onDisconnect: () => void;
  onSync: () => void;
}) {
  const live = isLive(conn);
  const pending = conn?.status === "needs_selection";
  const daysLeft = conn?.status === "connected" && conn.expiresAt ? Math.ceil((parseISO(conn.expiresAt).getTime() - Date.now()) / 86_400_000) : null;
  const expired = daysLeft != null && daysLeft <= 0;
  const linked = live || expired;
  const status = expired ? "Expired" : live ? "Connected" : pending ? PENDING_STATUS[channel] : conn?.error ? "Needs attention" : "Not connected";
  const targets = conn?.targets ?? [];
  const tone = live ? "success" : expired || conn?.error ? "destructive" : pending ? "warning" : "muted";
  const [one, many] = TARGET_NOUN[channel];
  const change = CHANGE_LABEL[channel];
  const warning = expired
    ? "Access expired — reconnect to keep posting"
    : daysLeft != null && daysLeft <= 14
      ? `Access expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — reconnect to renew`
      : (conn?.error ?? null);

  const menu = linked && (
    <Menu
      label={`${CONNECT_LABEL[channel]} actions`}
      trigger={(p) => (
        <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label={`${CONNECT_LABEL[channel]} actions`}>
          {busy === `c-${channel}` || busy === `dc-${channel}` || busy === `s-${channel}` ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </button>
      )}
      items={[
        ...(live ? [{ label: "Sync now", icon: RefreshCw, onSelect: onSync }] : []),
        { label: "Reconnect", icon: Link2, onSelect: onConnect },
        { label: "Disconnect", icon: Unplug, onSelect: onDisconnect, tone: "danger", separator: true },
      ]}
    />
  );

  const action =
    !available && !linked ? (
      <button type="button" className={buttonClass("outline", "sm")} disabled title="This network isn't available yet — contact support">
        Not available yet
      </button>
    ) : linked ? (
      change && (
        <button type="button" className={buttonClass("outline", "sm")} onClick={onPick}>
          Change {change.toLowerCase()}
        </button>
      )
    ) : pending ? (
      <button type="button" className={buttonClass("default", "sm")} onClick={onPick}>
        {PICK_LABEL[channel]}
      </button>
    ) : (
      <BrandConnectButton icon={<ChannelIcon channel={channel} className="h-4 w-4" />} network={NETWORK[channel]} onClick={onConnect} busy={busy === `c-${channel}`} />
    );

  return (
    <li className={ACCOUNT_ROW}>
      {/* Account */}
      <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background">
          <ChannelIcon channel={channel} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{CONNECT_LABEL[channel]}</p>
          <p className="truncate text-xs text-muted-foreground">
            {linked ? [conn?.account, conn?.lastSyncAt && `synced ${ago(conn.lastSyncAt)}`].filter(Boolean).join(" · ") || "Connected" : PURPOSE[channel]}
          </p>
          {warning && (
            <p className={cn("mt-0.5 flex items-center gap-1 truncate text-xs", expired || conn?.error ? "text-destructive" : "text-warning")}>
              <TriangleAlert className="h-3 w-3 shrink-0" />
              <span className="truncate">{warning}</span>
            </p>
          )}
        </div>
      </div>
      {/* ⋯ sits top-right on phones */}
      <div className="flex justify-end lg:hidden">{menu}</div>

      {/* Status · linked · change (second line on phones, columns on wide screens) */}
      <div className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[52px] lg:contents">
        <span className="lg:flex">
          <StatusPill tone={tone} label={status} />
        </span>
        <span className="min-w-0 text-sm lg:block">
          {linked && targets.length ? (
            <span className="flex min-w-0 items-center gap-1.5" title={targets.map((t) => t.name).join(", ")}>
              {channel === "google" && <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              {targets.length > 1 || channel === "google" ? (
                <span className="whitespace-nowrap">
                  <span className="font-semibold tabular-nums">{targets.length}</span> {targets.length === 1 ? one : many}
                </span>
              ) : (
                <span className="truncate">{targets[0].name}</span>
              )}
            </span>
          ) : (
            <span className="hidden text-muted-foreground lg:inline">—</span>
          )}
        </span>
        <span className="ml-auto lg:ml-0 lg:flex lg:justify-end">{action}</span>
      </div>
      <div className="hidden justify-end lg:flex">{menu}</div>
    </li>
  );
}

/** After sign-in: pick Google locations (several) or a Page / account (one). */
function TargetPicker({ channel, current, onClose, onSaved }: { channel: Channel | null; current: string[]; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<ConnectionOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const multi = channel === "google";

  useEffect(() => {
    if (!channel) return;
    setItems(null);
    setError(null);
    listConnectionOptions(channel).then((r) => {
      if (!r.ok) return setError(r.error);
      setItems(r.options);
      const usable = r.options.filter((o) => !o.disabled);
      const keep = usable.filter((o) => current.includes(o.id)).map((o) => o.id);
      // Nothing picked yet: Google starts with every location, others with the first usable option.
      setPicked(new Set(keep.length ? keep : multi ? usable.map((o) => o.id) : usable.slice(0, 1).map((o) => o.id)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const usable = items?.filter((o) => !o.disabled) ?? [];
  const all = usable.length > 0 && usable.every((o) => picked.has(o.id));
  const toggle = (id: string) =>
    setPicked((s) => {
      if (!multi) return new Set([id]);
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = async () => {
    if (!channel) return;
    if (!picked.size) return void toast.error(multi ? "Pick at least one location" : "Pick an account");
    setSaving(true);
    const res = await selectConnectionTargets(channel, [...picked]);
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(multi ? (picked.size === 1 ? "Location connected" : `${picked.size} locations connected`) : `${CONNECT_LABEL[channel]} connected`);
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={!!channel}
      onClose={() => !saving && onClose()}
      labelledBy="picker-title"
      className="h-auto max-h-[92dvh] max-w-md"
      title={<span id="picker-title">{channel ? PICK_TITLE[channel] : ""}</span>}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error ? (
          <p className="px-2 text-sm text-destructive">{error}</p>
        ) : !items ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">Nothing found on this account.</p>
        ) : (
          <>
            {multi && usable.length > 1 && (
              <button
                type="button"
                onClick={() => setPicked(new Set(all ? [] : usable.map((o) => o.id)))}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm font-semibold hover:bg-muted/50"
              >
                <Box checked={all} />
                All locations
                <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                  {picked.size}/{usable.length}
                </span>
              </button>
            )}
            <ul role={multi ? "group" : "radiogroup"} aria-label={channel ? PICK_TITLE[channel] : undefined} className={cn("divide-y", multi && usable.length > 1 && "border-t")}>
              {items.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role={multi ? "checkbox" : "radio"}
                    aria-checked={picked.has(o.id)}
                    disabled={!!o.disabled}
                    onClick={() => toggle(o.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <Box checked={picked.has(o.id)} round={!multi} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{o.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{o.disabled ?? o.sub}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {!!items?.length && (
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={buttonClass()} onClick={save} disabled={saving || !picked.size}>
            {saving && <Loader2 className="animate-spin" />}
            {multi && picked.size > 1 ? `Connect ${picked.size} locations` : "Connect"}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Box({ checked, round }: { checked: boolean; round?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center border",
        round ? "rounded-full" : "rounded",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
      )}
    >
      {checked && (round ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : <Check className="h-3 w-3" strokeWidth={3} />)}
    </span>
  );
}
