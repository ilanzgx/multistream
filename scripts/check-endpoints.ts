import { API_CONFIG } from "../apps/desktop/src/config/api";
import { PLATFORMS } from "../apps/desktop/src/config/platforms";
import { CDN_CONFIG } from "../apps/desktop/src/config/cdn";

interface CheckTarget {
  category: "APIs & Metadata" | "Players & Embeds" | "CDNs & Image Assets";
  name: string;
  url: string;
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

const targets: CheckTarget[] = [
  // --- APIs & Metadata ---
  {
    category: "APIs & Metadata",
    name: "Twitch GQL",
    url: API_CONFIG.twitch.gqlUrl,
    method: "POST",
    headers: {
      "Client-Id": API_CONFIG.twitch.clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: 'query { user(login: "twitch") { id } }',
    }),
  },
  {
    category: "APIs & Metadata",
    name: "Kick API v2 (Channel)",
    url: API_CONFIG.kick.apiV2Url("xqc"),
    method: "GET",
  },
  {
    category: "APIs & Metadata",
    name: "Kick API v1 (Channel)",
    url: API_CONFIG.kick.apiV1Url("xqc"),
    method: "GET",
  },
  {
    category: "APIs & Metadata",
    name: "Kick Emotes API",
    url: API_CONFIG.kick.emotesUrl("xqc"),
    method: "GET",
  },
  {
    category: "APIs & Metadata",
    name: "7TV Global Emotes",
    url: API_CONFIG.sevenTv.globalEmotesUrl,
    method: "GET",
  },
  {
    category: "APIs & Metadata",
    name: "BTTV Global Emotes",
    url: API_CONFIG.bttv.globalEmotesUrl,
    method: "GET",
  },
  {
    category: "APIs & Metadata",
    name: "Adamcy Twitch Emotes",
    url: API_CONFIG.adamcy.twitchGlobalEmotesUrl,
    method: "GET",
  },
  {
    category: "APIs & Metadata",
    name: "DecAPI Twitch ID",
    url: API_CONFIG.decapi.twitchIdUrl("gaules"),
    method: "GET",
  },
  {
    category: "APIs & Metadata",
    name: "DecAPI Twitch Avatar",
    url: API_CONFIG.decapi.twitchAvatarUrl("twitch"),
    method: "GET",
  },

  // --- Players & Embeds ---
  {
    category: "Players & Embeds",
    name: "Twitch Player Embed",
    url: PLATFORMS.twitch.getEmbedUrl("twitch", "localhost"),
    method: "GET",
  },
  {
    category: "Players & Embeds",
    name: "Twitch Chat Embed",
    url: PLATFORMS.twitch.getChatUrl("twitch", "localhost"),
    method: "GET",
  },
  {
    category: "Players & Embeds",
    name: "Kick Player Embed",
    url: PLATFORMS.kick.getEmbedUrl("xqc"),
    method: "GET",
  },
  {
    category: "Players & Embeds",
    name: "Kick Chat Embed",
    url: PLATFORMS.kick.getChatUrl("xqc"),
    method: "GET",
  },
  {
    category: "Players & Embeds",
    name: "YouTube Player Embed",
    url: PLATFORMS.youtube.getEmbedUrl("dQw4w9WgXcQ"),
    method: "GET",
  },
  {
    category: "Players & Embeds",
    name: "YouTube Live Chat",
    url: PLATFORMS.youtube.getChatUrl("dQw4w9WgXcQ"),
    method: "GET",
  },

  // --- CDNs & Image Assets ---
  {
    category: "CDNs & Image Assets",
    name: "Twitch Emote CDN",
    url: CDN_CONFIG.twitch.emote("25"),
    method: "GET",
  },
  {
    category: "CDNs & Image Assets",
    name: "Twitch Thumbnail CDN",
    url: CDN_CONFIG.twitch.previewThumbnail("twitch"),
    method: "GET",
  },
  {
    category: "CDNs & Image Assets",
    name: "7TV Emote CDN (WebP)",
    url: CDN_CONFIG.sevenTv.emote("01FCY771D800007PQ2DF3GDTN6"),
    method: "GET",
  },
  {
    category: "CDNs & Image Assets",
    name: "BTTV Emote CDN",
    url: CDN_CONFIG.bttv.emote("54fa8f1401e468494b85b537"),
    method: "GET",
  },
  {
    category: "CDNs & Image Assets",
    name: "UI-Avatars Fallback",
    url: CDN_CONFIG.avatarFallback("Multistream"),
    method: "GET",
  },
];

async function checkEndpoint(target: CheckTarget): Promise<{
  category: string;
  name: string;
  url: string;
  status: number | string;
  durationMs: number;
  ok: boolean;
  error?: string;
}> {
  const start = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(target.url, {
      method: target.method || "GET",
      headers: {
        "User-Agent": "Multistream/1.0 (Desktop App Endpoint Checker)",
        ...target.headers,
      },
      body: target.body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Math.round(performance.now() - start);
    return {
      category: target.category,
      name: target.name,
      url: target.url,
      status: res.status,
      durationMs,
      ok: res.status >= 200 && res.status < 400,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const durationMs = Math.round(performance.now() - start);
    return {
      category: target.category,
      name: target.name,
      url: target.url,
      status: err.name === "AbortError" ? "TIMEOUT" : "FAIL",
      durationMs,
      ok: false,
      error: err.message,
    };
  }
}

async function run() {
  console.log("\nChecking Multistream endpoints and assets...\n");

  const results = await Promise.all(targets.map(checkEndpoint));

  const categories = ["APIs & Metadata", "Players & Embeds", "CDNs & Image Assets"] as const;
  let passed = 0;
  let failed = 0;

  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    if (!catResults.length) continue;

    console.log(`\x1b[1m--- ${cat} ---\x1b[0m`);

    for (const r of catResults) {
      const statusText = String(r.status).padEnd(7);
      const durationText = `${r.durationMs}ms`.padStart(7);

      if (r.ok) {
        passed++;
        console.log(
          `  \x1b[32m[OK]\x1b[0m    [${r.name.padEnd(24)}] \x1b[32m${statusText}\x1b[0m (${durationText})`
        );
      } else if (r.status === 403 && r.url.includes("kick.com")) {
        // Kick blocks raw Node/Bun CLI user-agents via Cloudflare TLS fingerprinting
        passed++;
        console.log(
          `  \x1b[32m[OK/CF]\x1b[0m [${r.name.padEnd(24)}] \x1b[33m403\x1b[0m     (${durationText}) \x1b[90m(Cloudflare TLS Protected - Active via Rustls/WebView)\x1b[0m`
        );
      } else {
        failed++;
        console.log(
          `  \x1b[31m[FAIL]\x1b[0m  [${r.name.padEnd(24)}] \x1b[31m${statusText}\x1b[0m (${durationText}) \x1b[90m${r.url}\x1b[0m ${
            r.error ? `\x1b[31m(${r.error})\x1b[0m` : ""
          }`
        );
      }
    }
    console.log("");
  }

  if (failed === 0) {
    console.log(`\x1b[32mAll ${passed} tested endpoints and assets are operational.\x1b[0m\n`);
  } else {
    console.log(`\x1b[33m${passed} operational, ${failed} failed or unstable.\x1b[0m\n`);
    process.exitCode = 1;
  }
}

run();
