"use client";

// My profile: photo and name, password (change / reset link), and what you can access in this workspace.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import { Building2, Camera, Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Badge, Card, PageHeader, PanelHeader, buttonClass, inputClass } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { changeMyPassword, sendMyPasswordReset, updateMyAvatar, updateMyProfile } from "@/app/(app)/actions";
import type { Member } from "@/lib/gbp/types";
import { cn, initials } from "@/lib/utils";

const AVATAR_PX = 256;
const MAX_UPLOAD = 10 * 1024 * 1024;

/** Centre-crop to a square and resize, so avatars stay small (stored as data: URLs until file storage exists). */
async function squareAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(AVATAR_PX, side);
  canvas.getContext("2d")?.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

function AvatarImage({ url, name, className }: { url: string | null; name: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- data: URLs / Google photo URLs
    <img src={url} alt="" referrerPolicy="no-referrer" className={cn("rounded-full object-cover", className)} />
  ) : (
    <span className={cn("flex items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground", className)}>{initials(name)}</span>
  );
}

export function ProfileBoard({ me, locations }: { me: Member; locations: { id: string; title: string; address: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = name.trim() !== me.name;
  const photo = me.avatarUrl ?? me.googleAvatarUrl ?? null;
  const access = me.role === "admin" || !me.locationIds.length ? locations : locations.filter((l) => me.locationIds.includes(l.id));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await updateMyProfile({ name });
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Profile saved");
    router.refresh();
  };

  const setPhoto = async (url: string | null) => {
    setPhotoBusy(true);
    const res = await updateMyAvatar(url);
    setPhotoBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(url ? "Photo updated" : me.googleAvatarUrl ? "Using your Google photo again" : "Photo removed");
    router.refresh();
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return void toast.error("Upload a JPG, PNG or WebP image");
    if (file.size > MAX_UPLOAD) return void toast.error("Pick an image under 10 MB");
    try {
      await setPhoto(await squareAvatar(file));
    } catch {
      toast.error("Couldn't read that image");
    }
  };

  const sendReset = async () => {
    setSendingReset(true);
    const res = await sendMyPasswordReset();
    setSendingReset(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Reset link sent", { description: `Check ${res.email} for a link to choose a new password.` });
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader title="My profile">Your details and what you can access in this workspace</PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card className="overflow-hidden">
            <PanelHeader title="Personal info" />
            <form onSubmit={save} className="space-y-5 px-5 py-5 lg:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoBusy}
                  className="group relative h-20 w-20 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Change profile photo"
                >
                  <AvatarImage url={photo} name={name || me.name} className="h-20 w-20 text-xl" />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {photoBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  </span>
                  <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                </button>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={buttonClass("outline", "sm")} onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                      <Upload /> Upload photo
                    </button>
                    {me.avatarUrl && (
                      <button type="button" className={buttonClass("ghost", "sm", "text-destructive hover:bg-destructive/10")} onClick={() => setPhoto(null)} disabled={photoBusy}>
                        <Trash2 /> Remove
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {me.avatarUrl
                      ? "JPG, PNG or WebP. Removing it goes back to your Google photo."
                      : me.googleAvatarUrl
                        ? "Using your Google account photo. Upload one to use a different photo here."
                        : "JPG, PNG or WebP, square works best. Signing in with Google uses your Google photo."}
                  </p>
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
              </div>

              <label className="block space-y-1.5">
                <span className="label-caps block">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" className={cn(inputClass, "max-w-md")} />
                <span className="block text-xs text-muted-foreground">Shown to your team on reviews, posts and the Users page.</span>
              </label>

              <div className="space-y-1.5">
                <span className="label-caps block">Email</span>
                <div className="flex max-w-md items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{me.email}</span>
                </div>
                <span className="block text-xs text-muted-foreground">Your sign-in email. Ask an admin to change it.</span>
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <button type="button" className={buttonClass("outline")} disabled={!dirty || saving} onClick={() => setName(me.name)}>
                  Cancel
                </button>
                <button type="submit" className={buttonClass()} disabled={!dirty || saving || !name.trim()}>
                  {saving && <Loader2 className="animate-spin" />} Save
                </button>
              </div>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <PanelHeader title="Password" />
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center lg:px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <KeyRound className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {me.passwordChangedAt ? (
                  <>
                    <p className="font-semibold">••••••••••</p>
                    <p className="text-xs text-muted-foreground">Last changed {formatDistanceToNow(parseISO(me.passwordChangedAt), { addSuffix: true })}</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">No password set</p>
                    <p className="text-xs text-muted-foreground">You sign in with Google. Add a password to also sign in with your email.</p>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {me.passwordChangedAt && (
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={sendReset} disabled={sendingReset}>
                    {sendingReset && <Loader2 className="animate-spin" />} Email me a reset link
                  </button>
                )}
                <button type="button" className={buttonClass("outline", "sm")} onClick={() => setPasswordOpen(true)}>
                  {me.passwordChangedAt ? "Change password" : "Set password"}
                </button>
              </div>
            </div>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <PanelHeader title="Workspace access" />
          <div className="space-y-4 px-5 py-4 lg:px-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  Role <Badge variant={me.role === "admin" ? "default" : "secondary"}>{me.role === "admin" ? "Admin" : "Member"}</Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {me.role === "admin" ? "Everything, including Users and Settings." : "Day-to-day work on the locations below. Ask an admin to change this."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{me.role === "admin" || !me.locationIds.length ? "All locations" : `${access.length} location${access.length === 1 ? "" : "s"}`}</p>
                <ul className="mt-1.5 space-y-1">
                  {access.map((l) => (
                    <li key={l.id} className="truncate text-xs text-muted-foreground" title={l.address}>
                      {l.title}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {me.joinedAt && <p className="border-t pt-3 text-xs text-muted-foreground">Joined {formatDistanceToNow(parseISO(me.joinedAt), { addSuffix: true })}</p>}
          </div>
        </Card>
      </div>

      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} hasPassword={!!me.passwordChangedAt} onForgot={sendReset} onDone={() => router.refresh()} />
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block space-y-1.5">
      <span className="label-caps block">{label}</span>
      <span className="relative block">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} maxLength={128} className={cn(inputClass, "pr-10")} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function PasswordDialog({ open, onClose, hasPassword, onForgot, onDone }: { open: boolean; onClose: () => void; hasPassword: boolean; onForgot: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rules = [
    { ok: next.length >= 8, label: "At least 8 characters" },
    { ok: /[a-z]/i.test(next) && /\d/.test(next), label: "Letters and a number" },
    { ok: !!next && next === confirm, label: "Both new passwords match" },
  ];

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    onClose();
  };
  const close = () => !busy && reset();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await changeMyPassword({ current: hasPassword ? current : undefined, next, confirm });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(hasPassword ? "Password changed" : "Password set", { description: "Use it next time you sign in with your email." });
    onDone();
    reset();
  };

  return (
    <Modal open={open} onClose={close} title={hasPassword ? "Change password" : "Set a password"} className="h-auto max-h-[92dvh] sm:max-w-md">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {hasPassword && (
            <div className="space-y-1.5">
              <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  close();
                  onForgot();
                }}
              >
                Forgot it? Email me a reset link
              </button>
            </div>
          )}
          <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" autoFocus={!hasPassword} />
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <ul className="space-y-1">
            {rules.map((r) => (
              <li key={r.label} className={cn("flex items-center gap-2 text-xs", r.ok ? "text-success" : "text-muted-foreground")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", r.ok ? "bg-success" : "bg-muted-foreground/40")} />
                {r.label}
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={buttonClass("outline")} onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={buttonClass()} disabled={busy || !rules.every((r) => r.ok) || (hasPassword && !current)}>
            {busy && <Loader2 className="animate-spin" />} {hasPassword ? "Change password" : "Set password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
