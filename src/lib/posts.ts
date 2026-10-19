import type { BadgeVariant } from "@/components/ui";
import type { PostStatus, PostType } from "./gbp/types";

export const POST_STATUS: Record<PostStatus, { label: string; badge: BadgeVariant; dot: string; chip: string }> = {
  DRAFT: { label: "Draft", badge: "secondary", dot: "bg-muted-foreground", chip: "bg-muted text-muted-foreground" },
  SCHEDULED: { label: "Scheduled", badge: "default", dot: "bg-primary", chip: "bg-accent text-accent-foreground" },
  PUBLISHED: { label: "Published", badge: "success", dot: "bg-success", chip: "bg-success/10 text-success" },
  FAILED: { label: "Failed", badge: "destructive", dot: "bg-destructive", chip: "bg-destructive/10 text-destructive" },
};

export const POST_TYPE: Record<PostType, string> = { STANDARD: "Update", OFFER: "Offer", EVENT: "Event" };
