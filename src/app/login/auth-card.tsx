"use client";

// Sign in / Sign up with Google or email + password (Firebase Authentication). Every path ends the same way: a Firebase ID token →
// startSession (the server verifies it and sets the session cookie) → the app. Email accounts must verify their address first.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User } from "firebase/auth";
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { GoogleIcon } from "@/components/brand-icons";
import { buttonClass, inputClass } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { firebaseAuth, googleProvider } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { startSession } from "./actions";

type Mode = "signin" | "signup";

/** Firebase error codes → plain words. null = nothing to show (the user closed the Google window). */
function message(e: unknown): string | null {
  const code = e instanceof FirebaseError ? e.code : "";
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return null;
    case "auth/popup-blocked":
      return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match. Try again or reset your password.";
    case "auth/email-already-in-use":
      return "There's already an account with this email. Sign in instead.";
    case "auth/weak-password":
      return "Use at least 8 characters for your password.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This account has been turned off. Contact support.";
    case "auth/account-exists-with-different-credential":
      return "This email already signs in another way. Try Continue with Google.";
    case "auth/operation-not-allowed":
      return "This sign-in method isn't turned on in Firebase (Authentication → Sign-in method).";
    case "auth/unauthorized-domain":
      return "This domain isn't allowed in Firebase yet (Authentication → Settings → Authorized domains).";
    case "auth/network-request-failed":
      return "No connection to Google. Check your internet and try again.";
  }
  return e instanceof Error && !(e instanceof FirebaseError) ? e.message : "Something went wrong. Try again.";
}

export function AuthCard({ next, initialMode = "signin" }: { next: string; initialMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [view, setView] = useState<"form" | "reset" | "verify">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"google" | "email" | "reset" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<User | null>(null);

  // Arriving here means signed out of the app: clear Firebase's own browser session too.
  useEffect(() => {
    void signOut(firebaseAuth()).catch(() => {});
  }, []);

  const fail = (e: unknown) => {
    setBusy(null);
    setError(message(e));
  };

  /** Hand the Firebase user to the server and go to the app. */
  const finish = async (user: User) => {
    const res = await startSession(await user.getIdToken(true));
    if (!res.ok) throw new Error(res.error);
    router.replace(next);
    router.refresh();
  };

  const withGoogle = async () => {
    setBusy("google");
    setError(null);
    try {
      await finish((await signInWithPopup(firebaseAuth(), googleProvider())).user);
    } catch (e) {
      fail(e);
    }
  };

  const withEmail = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy("email");
    setError(null);
    try {
      if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { user } = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
        if (name.trim()) await updateProfile(user, { displayName: name.trim() });
        await sendEmailVerification(user);
        setPending(user);
        setView("verify");
        setBusy(null);
        return;
      }
      const { user } = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      if (!user.emailVerified) {
        setPending(user);
        setView("verify");
        setBusy(null);
        return;
      }
      await finish(user);
    } catch (e) {
      fail(e);
    }
  };

  /** "I've verified": reload the user so Firebase sees the verified email, then sign in. */
  const checkVerified = async () => {
    if (!pending) return;
    setBusy("check");
    setError(null);
    try {
      await pending.reload();
      if (!pending.emailVerified) {
        setBusy(null);
        setError("Not verified yet. Open the link in the email we sent, then try again.");
        return;
      }
      await finish(pending);
    } catch (e) {
      fail(e);
    }
  };

  const resend = async () => {
    if (!pending) return;
    try {
      await sendEmailVerification(pending);
      toast.success(`Sent a new link to ${pending.email}`);
    } catch (e) {
      setError(message(e));
    }
  };

  const reset = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy("reset");
    setError(null);
    try {
      await sendPasswordResetEmail(firebaseAuth(), email.trim());
      toast.success("Check your inbox", { description: `If ${email.trim()} has an account, a reset link is on its way.` });
      setView("form");
      setBusy(null);
    } catch (e) {
      fail(e);
    }
  };

  const errorBox = error && (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  );

  if (view === "verify")
    return (
      <div className="space-y-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <MailCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We sent a link to <span className="font-semibold text-foreground">{pending?.email}</span>. Open it, then come back here.
          </p>
        </div>
        {errorBox}
        <button type="button" onClick={checkVerified} disabled={busy === "check"} className={cn(buttonClass(), "h-11 w-full")}>
          {busy === "check" && <Loader2 className="animate-spin" />} I&apos;ve verified, continue
        </button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
            onClick={() => (setView("form"), setError(null), setPending(null), void signOut(firebaseAuth()))}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button type="button" className="font-semibold text-primary hover:underline" onClick={resend}>
            Resend email
          </button>
        </div>
      </div>
    );

  if (view === "reset")
    return (
      <form onSubmit={reset} className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a link to choose a new password.</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cn(inputClass, "h-11")} placeholder="you@business.com" />
        </label>
        {errorBox}
        <button type="submit" disabled={busy === "reset"} className={cn(buttonClass(), "h-11 w-full")}>
          {busy === "reset" && <Loader2 className="animate-spin" />} Send reset link
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => (setView("form"), setError(null))}>
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </button>
      </form>
    );

  const signup = mode === "signup";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{signup ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{signup ? "Free for every business. Set up in a minute." : "Sign in to manage your Business Profiles."}</p>
      </div>
      <Segmented
        label="Sign in or sign up"
        className="w-full [&>*]:flex-1"
        value={mode}
        onChange={(m) => (setMode(m), setError(null))}
        options={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Sign up" },
        ]}
      />
      <button type="button" onClick={withGoogle} disabled={!!busy} className={cn(buttonClass("outline"), "h-11 w-full gap-3 font-semibold")}>
        {busy === "google" ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
        {signup ? "Sign up with Google" : "Continue with Google"}
      </button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={withEmail} className="space-y-4">
        {signup && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Full name</span>
            <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={cn(inputClass, "h-11")} placeholder="Alex Parker" />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cn(inputClass, "h-11")} placeholder="you@business.com" />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between">
            <span className="text-sm font-medium">Password</span>
            {!signup && (
              <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => (setView("reset"), setError(null))}>
                Forgot password?
              </button>
            )}
          </span>
          <span className="relative block">
            <input
              type={show ? "text" : "password"}
              required
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(inputClass, "h-11 pr-10")}
              placeholder={signup ? "At least 8 characters" : "Your password"}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        {errorBox}
        <button type="submit" disabled={!!busy} className={cn(buttonClass(), "h-11 w-full")}>
          {busy === "email" && <Loader2 className="animate-spin" />} {signup ? "Create account" : "Sign in"}
        </button>
      </form>
      {signup && (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="font-medium text-foreground underline-offset-2 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-medium text-foreground underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {signup ? "Already have an account? " : "New to GBPNinja? "}
        <button type="button" className="font-semibold text-primary hover:underline" onClick={() => (setMode(signup ? "signin" : "signup"), setError(null))}>
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
