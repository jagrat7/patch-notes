import { defineSandbox } from "eve/sandbox";

/**
 * Sandbox for the video-producer subagent. Renders HyperFrames HTML
 * compositions to MP4, which needs:
 *   - Node 24 (default Vercel Sandbox runtime) for the `hyperframes` CLI.
 *   - FFmpeg, for muxing the captured frames into an MP4.
 *   - The system shared libraries that headless Chromium needs. HyperFrames
 *     drives Chromium via puppeteer-core + @puppeteer/browsers, so it
 *     downloads its OWN Chromium binary — we only need the `.so` deps present.
 *
 * Everything heavy is installed in `bootstrap` (template-scoped: it runs once
 * when the template is built, and the resulting snapshot seeds every later
 * session). Packages installed at session time would NOT persist; doing it in
 * bootstrap is what makes renders fast and cheap after the first build.
 *
 * Bump REVISION (via revalidationKey) whenever this install list changes, so
 * eve rebuilds the template instead of reusing a stale snapshot.
 *
 * `backend` is intentionally omitted, so eve uses `defaultBackend()`: Vercel
 * Sandbox when deployed on Vercel, Docker locally. Those use different package
 * managers (AL2023 `dnf` vs. the Debian-based eve image's `apt-get`), so the
 * bootstrap detects which is present and installs the matching package set.
 */

// Chromium's shared-library dependencies, per package manager. HyperFrames
// downloads its own Chromium (puppeteer-core), so we only supply the .so deps.
const DNF_PACKAGES = [
  "ffmpeg",
  "alsa-lib", "atk", "at-spi2-atk", "at-spi2-core", "cups-libs", "dbus-libs",
  "expat", "glib2", "gtk3", "libdrm", "mesa-libgbm", "libX11", "libXcomposite",
  "libXdamage", "libXext", "libXfixes", "libXrandr", "libxcb", "libxkbcommon",
  "libxshmfence", "nspr", "nss", "pango", "cairo", "liberation-fonts",
];

const APT_PACKAGES = [
  "ffmpeg",
  "libasound2", "libatk1.0-0", "libatk-bridge2.0-0", "libatspi2.0-0",
  "libcups2", "libdbus-1-3", "libexpat1", "libglib2.0-0", "libgtk-3-0",
  "libdrm2", "libgbm1", "libx11-6", "libxcomposite1", "libxdamage1",
  "libxext6", "libxfixes3", "libxrandr2", "libxcb1", "libxkbcommon0",
  "libnspr4", "libnss3", "libpango-1.0-0", "libcairo2", "fonts-liberation",
];

const REVISION = "video-deps-v1";

export default defineSandbox({
  // No explicit backend: defaultBackend() → Vercel Sandbox on deploy, Docker locally.
  revalidationKey: () => REVISION,
  async bootstrap({ use }) {
    const sandbox = await use();

    // Detect package manager and install the matching set. `|| true` keeps the
    // probe useful even if one package is unavailable — we diagnose via ldd.
    const script = [
      'if command -v dnf >/dev/null 2>&1; then',
      `  sudo dnf install -y --allowerasing ${DNF_PACKAGES.join(" ")} || true;`,
      'elif command -v apt-get >/dev/null 2>&1; then',
      "  sudo apt-get update -y || true;",
      `  sudo apt-get install -y ${APT_PACKAGES.join(" ")} || true;`,
      'else echo "no supported package manager found"; fi',
    ].join("\n");

    await sandbox.run({ command: script });
  },
});
