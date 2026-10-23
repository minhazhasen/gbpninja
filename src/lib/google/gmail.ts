// Send mail through the connected Gmail account (Gmail API users.messages.send, gmail.send scope).
import { randomBytes } from "node:crypto";
import { googleFetch } from "./oauth";

/** RFC 2047 encoded-word, so non-ASCII names and subjects survive. */
const word = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");

export async function sendGmail(m: { from: string; fromName?: string | null; to: string; subject: string; body: string; html?: string }) {
  if (/[\r\n]/.test(m.to + m.subject + (m.fromName ?? ""))) throw new Error("Invalid email header");
  const boundary = `gbpn_${randomBytes(12).toString("hex")}`;
  const from = m.fromName ? `${word(m.fromName.replace(/"/g, ""))} <${m.from}>` : m.from;
  const head = [`From: ${from}`, `To: ${m.to}`, `Subject: ${word(m.subject)}`, "MIME-Version: 1.0"];
  const mime = m.html
    ? [
        ...head,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        b64(m.body),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        b64(m.html),
        `--${boundary}--`,
      ]
    : [...head, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(m.body)];
  await googleFetch("gmail", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mime.join("\r\n"), "utf8").toString("base64url") }),
  });
}
