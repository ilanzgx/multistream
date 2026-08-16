import fs from "node:fs";
import path from "node:path";

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
  assets: GitHubAsset[];
}

export interface GitHubRepo {
  stargazers_count: number;
}

interface GitHubCacheData {
  timestamp: number;
  stars?: number;
  latestAssets?: GitHubAsset[];
  releases?: GitHubRelease[];
}

const GITHUB_REPO = "ilanzgx/multistream";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora de cache em desenvolvimento
const CACHE_FILE_PATH = path.join(process.cwd(), ".astro", "github-dev-cache.json");

function readCache(): GitHubCacheData | null {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const content = fs.readFileSync(CACHE_FILE_PATH, "utf-8");
      return JSON.parse(content) as GitHubCacheData;
    }
  } catch {
    // Ignora erros de leitura de cache
  }
  return null;
}

function writeCache(data: Partial<GitHubCacheData>): void {
  try {
    const existing = readCache() || { timestamp: Date.now() };
    const updated = {
      ...existing,
      ...data,
      timestamp: Date.now(),
    };
    const dir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch {
    // Ignora erros de escrita de cache
  }
}

function getFetchHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Multistream-LandingPage",
  };
  const token = import.meta.env.GITHUB_TOKEN;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchRepoStars(): Promise<number> {
  const isDev = import.meta.env.DEV;
  const cache = readCache();

  // Em desenvolvimento, se houver cache recente, reusa para poupar a cota de requisições
  if (isDev && cache?.stars !== undefined && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.stars;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: getFetchHeaders(),
    });
    if (res.ok) {
      const data: GitHubRepo = await res.json();
      const stars = data.stargazers_count || 0;
      writeCache({ stars });
      return stars;
    }
    // Se bater rate limit em dev, reutiliza o último valor real salvo no cache
    if (cache?.stars !== undefined) {
      return cache.stars;
    }
    return 0;
  } catch {
    return cache?.stars ?? 0;
  }
}

export async function fetchLatestReleaseAssets(): Promise<GitHubAsset[]> {
  const isDev = import.meta.env.DEV;
  const cache = readCache();

  if (
    isDev &&
    cache?.latestAssets &&
    cache.latestAssets.length > 0 &&
    Date.now() - cache.timestamp < CACHE_TTL_MS
  ) {
    return cache.latestAssets;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: getFetchHeaders(),
    });
    if (res.ok) {
      const release: GitHubRelease = await res.json();
      const assets = release.assets || [];
      writeCache({ latestAssets: assets });
      return assets;
    }
    if (cache?.latestAssets) {
      return cache.latestAssets;
    }
    return [];
  } catch {
    return cache?.latestAssets ?? [];
  }
}

export async function fetchRecentReleases(limit = 3): Promise<GitHubRelease[]> {
  const isDev = import.meta.env.DEV;
  const cache = readCache();

  if (
    isDev &&
    cache?.releases &&
    cache.releases.length > 0 &&
    Date.now() - cache.timestamp < CACHE_TTL_MS
  ) {
    return cache.releases.slice(0, limit);
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`, {
      headers: getFetchHeaders(),
    });
    if (res.ok) {
      const data: GitHubRelease[] = await res.json();
      const releases = Array.isArray(data) ? data : [];
      writeCache({ releases });
      return releases.slice(0, limit);
    }
    if (cache?.releases) {
      return cache.releases.slice(0, limit);
    }
    return [];
  } catch {
    return cache?.releases?.slice(0, limit) ?? [];
  }
}
