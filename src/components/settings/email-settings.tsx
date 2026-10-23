"use client";

// Settings → Email: connect Gmail to send review requests from your own address, set the sender details, see today's sending.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { FileText, Info, Link2, Loader2, Lock, Mail, MoreHorizontal, Send, Unplug } from "lucide-react";
import { GmailIcon, GoogleIcon } from "@/components/brand-icons";
import { Card, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { Menu, useConfirm } from "@/components/ui-client";
import { connectGmail, disconnectGmail, sendTestEmail, updateEmailSender } from "@/app/(app)/actions";
import type { EmailSender } from "@/lib/gbp/types";
import { cn } from "@/lib/utils";
import { ACCOUNT_ROW, AccountColumns, BrandConnectButton, StatusPill } from "./account-grid";
import { useOAuthReturn } from "./oauth-return";

export function EmailSettings({ sender, businessName, available, demo, templatesHref }: { sender: EmailSender; businessName: string; available: boolean; demo: boolean; templatesHref: string }) {
  const router = useRouter();
  useOAuthReturn();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [fromName, setFromName] = useState(sender.fromName ?? "");
  const connected = sender.status === "connected";
  const dirty = fromName.trim() !== (sender.fromName ?? "");
  const used = Math.min(100, Math.round((sender.sentToday / sender.dailyLimit) * 100));

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error ?? "Something went wrong");
    toast.success(ok);
    router.refresh();
  };

  const connect = async () => {
    setBusy("connect");
    const res = await connectGmail();
    if (res.ok && res.redirect) return void window.location.assign(res.redirect);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    if (demo) toast.message("Demo: signed in with Google", { description: "In live mode this asks Google for permission to send email from your Gmail." });
    else toast.success("Gmail connected");
    router.refresh();
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect Gmail?",
      description: "Review request emails will open in your own mail app instead of being sent from here.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (ok) await run("disconnect", disconnectGmail, "Gmail disconnected");
  };

  const test = async () => {
    setBusy("test");
    const res = await sendTestEmail();
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Test email sent", { description: demo ? `Demo: nothing was really sent to ${res.to}.` : `Check ${res.to}.` });
    router.refresh();
  };

  const menu = connected && (
    <Menu
      label="Gmail actions"
      trigger={(p) => (
        <button type="button" {...p} className={buttonClass("ghost", "icon", "h-8 w-8 text-muted-foreground")} aria-label="Gmail actions">
          {busy && busy !== "save" ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </button>
      )}
      items={[
        { label: "Send test email", icon: Send, onSelect: test },
        { label: "Reconnect", icon: Link2, onSelect: connect },
        { label: "Disconnect", icon: Unplug, onSelect: disconnect, tone: "danger", separator: true },
      ]}
    />
  );

  return (
    <div className="space-y-5">
      {dialog}
      <Card className="overflow-hidden">
        <PanelHeader title="Sending email" meta="review requests" />
        <AccountColumns third="Sends from" />
        <ul>
          <li className={ACCOUNT_ROW}>
            <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background">
                <GmailIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">Gmail</p>
                <p className="truncate text-xs text-muted-foreground">
                  {connected && sender.connectedAt
                    ? `Connected ${formatDistanceToNow(parseISO(sender.connectedAt), { addSuffix: true })}`
                    : "Gmail or Google Workspace. We only ask to send email, never to read it."}
                </p>
              </div>
            </div>
            <div className="flex justify-end lg:hidden">{menu}</div>
            <div className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[52px] lg:contents">
              <span className="lg:flex">
                <StatusPill tone={connected ? "success" : "muted"} label={connected ? "Connected" : "Not connected"} />
              </span>
              <span className="min-w-0 text-sm lg:block">
                {connected ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{sender.email}</span>
                  </span>
                ) : (
                  <span className="hidden text-muted-foreground lg:inline">—</span>
                )}
              </span>
              <span className="ml-auto lg:ml-0 lg:flex lg:justify-end">
                {connected ? (
                  <button type="button" className={buttonClass("outline", "sm")} onClick={test} disabled={busy === "test"}>
                    {busy === "test" ? <Loader2 className="animate-spin" /> : <Send />} Send test
                  </button>
                ) : available ? (
                  <BrandConnectButton icon={<GoogleIcon className="h-4 w-4" />} network="Google" onClick={connect} busy={busy === "connect"} />
                ) : (
                  <button type="button" className={buttonClass("outline", "sm")} disabled title="Google sign-in isn't set up yet — contact support">
                    Not available yet
                  </button>
                )}
              </span>
            </div>
            <div className="hidden justify-end lg:flex">{menu}</div>
          </li>
        </ul>
        {!connected && (
          <p className="flex items-start gap-2 border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground lg:px-6">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Without Gmail, &ldquo;Request a review&rdquo; opens the email in your device&apos;s mail app and you send it yourself.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <PanelHeader title="Sender details" />
          <form
            className="space-y-4 px-5 py-5 lg:px-6"
            onSubmit={(e) => {
              e.preventDefault();
              run("save", () => updateEmailSender({ fromName }), "Sender details saved");
            }}
          >
            <label className="block space-y-1.5">
              <span className="label-caps block">From name</span>
              <input value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={80} placeholder={businessName} className={inputClass} />
              <span className="block text-xs text-muted-foreground">Leave blank to use each location&apos;s business name.</span>
            </label>
            <div className="space-y-1.5">
              <span className="label-caps block">Email address</span>
              <div className={cn(inputClass, "flex items-center gap-2 bg-muted/40 text-muted-foreground")} aria-readonly="true">
                <GmailIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{sender.email ?? "Connect Gmail to send from your address"}</span>
                <Lock className="h-3.5 w-3.5 shrink-0" />
              </div>
              <span className="block text-xs text-muted-foreground">
                Comes from your connected Google account; customers&apos; replies go here. To use another address, reconnect with that Google account.
              </span>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <p className="label-caps mb-1">Customers see</p>
              <p className="truncate">
                <span className="text-muted-foreground">From: </span>
                <span className="font-medium">{fromName.trim() || businessName}</span>
                <span className="text-muted-foreground"> &lt;{sender.email ?? "your Gmail address"}&gt;</span>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={buttonClass("outline")}
                disabled={!dirty || busy === "save"}
                onClick={() => {
                  setFromName(sender.fromName ?? "");
                }}
              >
                Cancel
              </button>
              <button type="submit" className={buttonClass()} disabled={!dirty || busy === "save"}>
                {busy === "save" && <Loader2 className="animate-spin" />} Save
              </button>
            </div>
          </form>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card className="overflow-hidden">
            <PanelHeader title="Today" meta="emails sent" />
            <div className="space-y-2 px-5 py-4 lg:px-6">
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums">{sender.sentToday}</span>
                <span className="text-sm text-muted-foreground">of {sender.dailyLimit.toLocaleString()} a day</span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-[width]", used >= 90 ? "bg-destructive" : used >= 70 ? "bg-warning" : "bg-primary")} style={{ width: `${used}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Gmail&apos;s own limit: about 500 a day for personal Gmail, 2,000 for Google Workspace.</p>
            </div>
          </Card>
          <Card className="flex items-start gap-3 px-5 py-4 lg:px-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">What gets sent</p>
              <p className="text-muted-foreground">The default review request template, with the customer&apos;s name and your Google review link filled in.</p>
              <Link href={templatesHref} className="mt-1 inline-block text-sm font-semibold text-primary hover:underline">
                Edit templates
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
