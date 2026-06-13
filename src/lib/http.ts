import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * @brief Check if the app is running in Tauri
 *
 * @return true if the app is running in Tauri, false otherwise
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * @brief HTTP GET request
 *
 * Sends an HTTP GET request to the given URL.
 *
 * @param url The URL to send the request to
 * @param headers The headers to send with the request
 * @return The response
 */
export async function httpGet(url: string, headers?: Record<string, string>): Promise<Response> {
  if (isTauri()) {
    return tauriFetch(url, { method: "GET", headers });
  }
  return fetch(url, { headers });
}

/**
 * @brief HTTP POST request
 *
 * Sends an HTTP POST request to the given URL.
 *
 * @param url The URL to send the request to
 * @param body The body of the request
 * @param headers The headers to send with the request
 * @return The response
 */
export async function httpPost(
  url: string,
  body: string,
  headers?: Record<string, string>
): Promise<Response> {
  if (isTauri()) {
    return tauriFetch(url, { method: "POST", body, headers });
  }
  return fetch(url, { method: "POST", body, headers });
}
