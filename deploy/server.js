// cPanel start-up file (Setup Node.js App → Application startup file = server.js).
// The deploy uploads ONE archive (app.tar.gz) instead of thousands of files over FTPS. On start, unpack it into ./app when its
// release id (release.txt = git commit) changed, then run the real Next.js standalone server from there.
// Swapped in atomically: unpack to app.new → rename. Previous release is kept as app.prev until the next deploy.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = __dirname;
const archive = path.join(root, "app.tar.gz");
const app = path.join(root, "app");
const releaseFile = path.join(root, "release.txt");
const read = (f) => {
  try {
    return fs.readFileSync(f, "utf8").trim();
  } catch {
    return null;
  }
};

const wanted = read(releaseFile);
const current = read(path.join(app, ".release"));
if (wanted && wanted !== current && fs.existsSync(archive)) {
  const next = `${app}.new`;
  const prev = `${app}.prev`;
  fs.rmSync(next, { recursive: true, force: true });
  fs.mkdirSync(next, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", next], { stdio: "inherit" });
  fs.writeFileSync(path.join(next, ".release"), wanted);
  fs.rmSync(prev, { recursive: true, force: true });
  if (fs.existsSync(app)) fs.renameSync(app, prev);
  fs.renameSync(next, app);
  console.log(`[deploy] Unpacked release ${wanted}`);
}

// CloudLinux counts every thread toward the account's process limit (shared with PHP for all sites). Keep libuv's pool small.
process.env.UV_THREADPOOL_SIZE ||= "2";

require(path.join(app, "server.js"));
