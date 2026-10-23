// Google Meet links for offer meetings.
// Live: a Google Calendar event on the signed-in platform admin's calendar with a Meet conference, the client as attendee
//   POST https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all
//   body: { summary, description, start, end, attendees: [{ email }], conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } }
//   → response.hangoutLink. Needs the https://www.googleapis.com/auth/calendar.events scope on the admin's Google sign-in.
// Demo: a made-up meet.google.com link (doesn't open a real call).
import { auth } from "@/auth";
import { isDemo } from "@/lib/connections";
import { MEETING_MINUTES, type OfferLead } from "./types";

const letters = (n: number) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

export async function createMeetLink(lead: OfferLead): Promise<string> {
  if (isDemo()) return `https://meet.google.com/${letters(3)}-${letters(4)}-${letters(3)}`;

  const token = (await auth())?.accessToken;
  if (!token) throw new Error("Sign in with Google (Calendar access) to create Meet links, or paste a link instead");
  const start = new Date(lead.meetingAt);
  const end = new Date(start.getTime() + MEETING_MINUTES * 60_000);
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `${lead.offerTitle} · ${lead.profileTitle}`,
      description: lead.note ?? undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: [{ email: lead.email, displayName: lead.name }],
      conferenceData: { createRequest: { requestId: `${lead.id}-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { hangoutLink?: string; error?: { message?: string } };
  if (!res.ok || !data.hangoutLink) throw new Error(data.error?.message ?? "Google Calendar couldn't create a Meet link. Paste one instead.");
  return data.hangoutLink;
}

export const isMeetUrl = (url: string) => /^https:\/\/([a-z0-9-]+\.)*(google\.com|zoom\.us|teams\.microsoft\.com|whereby\.com)\//i.test(url);
