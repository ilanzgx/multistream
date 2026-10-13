import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface PusherCredentials {
  app_key: string;
  cluster: string;
}

interface CentrifugoCredentials {
  url: string;
}

interface RealtimeResponse {
  data?: {
    connections?: Array<{
      provider: string;
      credentials: PusherCredentials | CentrifugoCredentials;
    }>;
    mode?: string;
  };
  message?: string;
}

const PUSHER_RS_PATH = path.resolve(
  import.meta.dir,
  "../apps/desktop/src-tauri/src/kick/pusher.rs"
);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function queryKickRealtimeApi(): Promise<{
  pusher?: PusherCredentials;
  centrifugo?: CentrifugoCredentials;
} | null> {
  const payload = {
    client: { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", type: "web" },
    capabilities: {
      accepted_providers: [{ provider: "pusher" }, { provider: "centrifugo" }],
    },
  };

  try {
    const res = await fetch("https://web.kick.com/api/v1/realtime/connection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as RealtimeResponse;
    const connections = data.data?.connections || [];

    let pusher: PusherCredentials | undefined;
    let centrifugo: CentrifugoCredentials | undefined;

    for (const conn of connections) {
      if (conn.provider === "pusher") {
        pusher = conn.credentials as PusherCredentials;
      } else if (conn.provider === "centrifugo") {
        centrifugo = conn.credentials as CentrifugoCredentials;
      }
    }

    // If pusher wasn't returned because Centrifugo took priority, query pusher specifically
    if (!pusher) {
      const pusherOnlyPayload = {
        client: { id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", type: "web" },
        capabilities: {
          accepted_providers: [{ provider: "pusher" }],
        },
      };

      const pusherRes = await fetch("https://web.kick.com/api/v1/realtime/connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(pusherOnlyPayload),
      });

      if (pusherRes.ok) {
        const pData = (await pusherRes.json()) as RealtimeResponse;
        const pConn = pData.data?.connections?.find((c) => c.provider === "pusher");
        if (pConn) {
          pusher = pConn.credentials as PusherCredentials;
        }
      }
    }

    return { pusher, centrifugo };
  } catch {
    return null;
  }
}

async function scrapeKickBundlesForPusher(): Promise<PusherCredentials | null> {
  try {
    const homeRes = await fetch("https://kick.com", {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!homeRes.ok) return null;
    const homeHtml = await homeRes.text();

    const chunkMatches = homeHtml.match(/_next\/static\/chunks\/[^"']+\.js/g);
    if (!chunkMatches || chunkMatches.length === 0) return null;

    const uniqueChunks = Array.from(new Set(chunkMatches));

    for (const chunkPath of uniqueChunks) {
      const chunkUrl = `https://assets.kick.com/main/${chunkPath}`;
      try {
        const chunkRes = await fetch(chunkUrl);
        if (!chunkRes.ok) continue;
        const chunkText = await chunkRes.text();

        if (chunkText.includes("pusher") || chunkText.includes("app_key")) {
          // Look for 20-char hex key followed by cluster
          const keyMatch = chunkText.match(/app_key:\s*["']([a-f0-9]{20})["']/);
          const clusterMatch = chunkText.match(/cluster:\s*["']([a-z0-9]+)["']/);
          if (keyMatch) {
            return {
              app_key: keyMatch[1],
              cluster: clusterMatch ? clusterMatch[1] : "us2",
            };
          }
        }
      } catch {
        // Continue searching other chunks
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function testWebSocketHandshake(
  appKey: string,
  cluster: string
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const url = `wss://ws-${cluster}.pusher.com/app/${appKey}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;
    let ws: WebSocket | null = null;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (ws) ws.close();
        resolve({ ok: false, error: "Connection timeout after 6s" });
      }
    }, 6000);

    try {
      ws = new WebSocket(url);

      ws.onmessage = (event) => {
        const data = String(event.data);
        if (data.includes("pusher:connection_established")) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            ws?.close();
            resolve({ ok: true });
          }
        } else if (data.includes("pusher:error")) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            ws?.close();
            resolve({ ok: false, error: data });
          }
        }
      };

      ws.onerror = (e) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ ok: false, error: e.message || "WebSocket error" });
        }
      };

      ws.onclose = (event) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            ok: false,
            error: `Closed with code ${event.code}: ${event.reason || "unknown"}`,
          });
        }
      };
    } catch (err: unknown) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}

async function main() {
  const isFix = process.argv.includes("--fix") || process.argv.includes("-f");

  console.log("\n=======================================================");
  console.log(" Multistream Kick Realtime & Pusher Key Auditor");
  console.log("=======================================================\n");

  // 1. Read current Rust config
  const pusherRsFile = Bun.file(PUSHER_RS_PATH);
  if (!(await pusherRsFile.exists())) {
    console.error(`[ERROR] Could not find Rust file at: ${PUSHER_RS_PATH}`);
    process.exit(1);
  }

  const pusherRsContent = await pusherRsFile.text();
  const keyMatch = pusherRsContent.match(
    /pub const DEFAULT_PUSHER_APP_KEY:\s*&str\s*=\s*"([a-f0-9]+)";/
  );
  const clusterMatch = pusherRsContent.match(
    /pub const DEFAULT_PUSHER_CLUSTER:\s*&str\s*=\s*"([a-z0-9]+)";/
  );

  if (!keyMatch || !clusterMatch) {
    console.error(
      "[ERROR] Failed to parse DEFAULT_PUSHER_APP_KEY or DEFAULT_PUSHER_CLUSTER in pusher.rs"
    );
    process.exit(1);
  }

  const currentAppKey = keyMatch[1];
  const currentCluster = clusterMatch[1];

  console.log("[INFO] Current Rust backend fallback config:");
  console.log(`  Cluster:  ${currentCluster}`);
  console.log(`  App Key:  ${currentAppKey}`);
  console.log("  File:     apps/desktop/src-tauri/src/kick/pusher.rs\n");

  // 2. Discover live credentials from Kick
  console.log("[INFO] Querying Kick realtime infrastructure...");

  let discovered = await queryKickRealtimeApi();
  let source = "Kick Realtime Negotiation API (/v1/realtime/connection)";

  if (!discovered || !discovered.pusher) {
    console.log(
      "  [WARN] Negotiation API did not return Pusher. Falling back to Next.js bundle scraping..."
    );
    const scrapedPusher = await scrapeKickBundlesForPusher();
    if (scrapedPusher) {
      discovered = { pusher: scrapedPusher };
      source = "Frontend Next.js Assets Bundle Scrape (assets.kick.com)";
    }
  }

  if (!discovered || !discovered.pusher) {
    console.error("[ERROR] Failed to discover live Kick realtime credentials.");
    process.exit(1);
  }

  const livePusher = discovered.pusher;
  if (
    typeof livePusher.app_key !== "string" ||
    !/^[a-f0-9]+$/.test(livePusher.app_key) ||
    typeof livePusher.cluster !== "string" ||
    !/^[a-z0-9]+$/.test(livePusher.cluster)
  ) {
    console.error("[ERROR] Discovered Pusher credentials have an invalid shape.");
    process.exit(1);
  }

  console.log(`[INFO] Live credentials retrieved via ${source}:`);
  console.log(`  Pusher Cluster:     ${livePusher.cluster}`);
  console.log(`  Pusher App Key:     ${livePusher.app_key}`);

  if (discovered.centrifugo) {
    console.log(`  Centrifugo Server:  ${discovered.centrifugo.url}`);
  }
  console.log("");

  // 3. Test active live handshake with Pusher
  console.log("[INFO] Testing WebSocket handshake with discovered Pusher key...");
  const handshake = await testWebSocketHandshake(livePusher.app_key, livePusher.cluster);

  if (!handshake.ok) {
    console.error(`[ERROR] WebSocket handshake failed: ${handshake.error}`);
    process.exit(1);
  }
  console.log(
    "[INFO] WebSocket handshake established successfully (connection_established received).\n"
  );

  // 4. Compare Rust key with Live key
  const isMatch = currentAppKey === livePusher.app_key && currentCluster === livePusher.cluster;

  if (isMatch) {
    console.log("[STATUS] OK - The Rust backend key is up to date.");
    console.log(`  Key: ${currentAppKey} (${currentCluster})`);
  } else {
    console.warn("[STATUS] MISMATCH DETECTED!");
    console.warn(`  Rust fallback:  ${currentAppKey} (${currentCluster})`);
    console.warn(`  Live Kick key:  ${livePusher.app_key} (${livePusher.cluster})`);

    if (isFix) {
      console.log("\n[INFO] Flag --fix detected. Updating pusher.rs...");
      const updatedContent = pusherRsContent
        .replace(keyMatch[0], `pub const DEFAULT_PUSHER_APP_KEY: &str = "${livePusher.app_key}";`)
        .replace(
          clusterMatch[0],
          `pub const DEFAULT_PUSHER_CLUSTER: &str = "${livePusher.cluster}";`
        );
      await Bun.write(PUSHER_RS_PATH, updatedContent);
      console.log("[INFO] pusher.rs successfully updated!");

      const configDir =
        process.platform === "win32"
          ? process.env.APPDATA
          : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
      if (configDir) {
        const cachePaths = [
          path.join(configDir, "multistream", "kick_pusher_config.json"),
          path.join(configDir, "multistream", "kick_pusher_config_dev.json"),
        ];
        for (const cPath of cachePaths) {
          try {
            if (fs.existsSync(cPath)) {
              await Bun.write(cPath, JSON.stringify(livePusher, null, 2));
              console.log(`[INFO] Synchronized runtime disk cache at: ${cPath}`);
            }
          } catch (err) {
            console.warn(`[WARN] Could not update disk cache at ${cPath}:`, err);
          }
        }
      }
    } else {
      console.log("\n[TIP] To automatically update pusher.rs with the active key, run:");
      console.log("  bun run kick:check --fix\n");
    }
  }

  console.log("=======================================================\n");
}

main();
