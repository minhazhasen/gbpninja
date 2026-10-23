// The app's public address for redirects. Behind cPanel's proxy a route handler's req.url is the internal server address
// (http://0.0.0.0:3000/…), so redirects use APP_URL, else the host the browser used (x-forwarded-host / host).
export function publicOrigin(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && !host.startsWith("0.0.0.0")) return `${req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  return new URL(req.url).origin;
}

export const publicUrl = (path: string, req: Request) => new URL(path, publicOrigin(req));
