"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { buttonClass } from "@/components/ui";

export function SignOutButton() {
  return (
    <button type="button" onClick={() => void signOutAction()} className={buttonClass("outline")}>
      <LogOut /> Sign out
    </button>
  );
}
