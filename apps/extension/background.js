/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-in-multistream",
    title: "Add to Multistream",
    contexts: ["page", "link", "frame"],
  });
});

// Check if direct link matches supported platforms
function extractFromUrlString(targetUrl) {
  try {
    const url = new URL(targetUrl);
    const host = url.hostname.replace(/^www\./, "");

    // 1. Twitch
    if (host === "twitch.tv") {
      const ignored = [
        "directory",
        "videos",
        "settings",
        "drops",
        "subscriptions",
        "p",
        "popout",
        "search",
        "",
      ];
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 1 && !ignored.includes(parts[0].toLowerCase())) {
        return { platform: "twitch", channel: parts[0].toLowerCase() };
      }
    }

    // 2. Kick
    if (host === "kick.com") {
      const ignored = [
        "categories",
        "video",
        "terms-of-service",
        "privacy-policy",
        "search",
        "following",
        "",
      ];
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 1 && !ignored.includes(parts[0].toLowerCase())) {
        return { platform: "kick", channel: parts[0].toLowerCase() };
      }
    }

    // 3. YouTube
    if (host === "youtube.com" || host === "youtu.be") {
      if (host === "youtu.be") {
        const vid = url.pathname.slice(1);
        if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) {
          return { platform: "youtube", channel: vid };
        }
      }

      const videoId = url.searchParams.get("v");
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return { platform: "youtube", channel: videoId };
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      if ((pathParts[0] === "live" || pathParts[0] === "embed") && pathParts[1]) {
        return { platform: "youtube", channel: pathParts[1] };
      }
    }

    // Reject direct tracker or advertisement frame URLs
    const isTracker =
      /(googleads|doubleclick|googletag|recaptcha|hcaptcha|turnstile|stripe|paypal|facebook|twitter|instagram|tiktok\.com\/embed|disqus|zendesk|intercom|crisp|trustpilot|spotify|soundcloud|hubspot|onetrust|cookie|analytics|adservice)/i.test(
        targetUrl
      );
    if (isTracker) {
      return null;
    }

    // Valid direct iframe or custom stream URL
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { platform: "custom", iframeUrl: targetUrl };
    }

    return null;
  } catch {
    return null;
  }
}

// Inspect active tab DOM for active live broadcasts or player embeds
function inspectPageDOM() {
  const href = window.location.href;
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, "");

  // 1. Twitch
  if (host === "twitch.tv") {
    const ignored = [
      "directory",
      "videos",
      "settings",
      "drops",
      "subscriptions",
      "p",
      "popout",
      "search",
      "",
    ];
    const parts = url.pathname.split("/").filter(Boolean);
    const channel = parts[0]?.toLowerCase();

    if (!channel || ignored.includes(channel)) {
      return null;
    }

    // Verify if stream has active broadcast indicators
    const hasLiveIndicator = !!(
      document.querySelector(".tw-channel-status-text-indicator") ||
      document.querySelector('[data-a-target="animated-channel-viewers-count"]') ||
      document.querySelector(".live-indicator-container")
    );

    const videoEl = document.querySelector(".video-player__container video");
    const isPlaying = videoEl && !videoEl.paused && videoEl.readyState >= 2;

    // Check if page indicates offline status
    const isOffline = !!(
      document.querySelector(".channel-status-info--offline") ||
      document.querySelector('[data-a-target="player-overlay-offline"]')
    );

    if (isOffline && !isPlaying) {
      return null;
    }

    if (hasLiveIndicator || isPlaying || parts.length === 1) {
      return { platform: "twitch", channel };
    }

    return null;
  }

  // 2. Kick
  if (host === "kick.com") {
    const ignored = [
      "categories",
      "video",
      "terms-of-service",
      "privacy-policy",
      "search",
      "following",
      "",
    ];
    const channel = url.pathname.split("/").find(Boolean)?.toLowerCase();

    if (!channel || ignored.includes(channel)) {
      return null;
    }

    const videoEl = document.querySelector("#main-view video, .vjs-tech");
    const isPlaying = videoEl && !videoEl.paused;
    const isOffline = !!document.querySelector(".stream-offline, [data-stream-offline]");

    if (isOffline && !isPlaying) {
      return null;
    }

    return { platform: "kick", channel };
  }

  // 3. YouTube (only active live broadcasts or video currently being watched)
  if (host === "youtube.com" || host === "youtu.be") {
    // 3.1 Direct video parameter in URL
    const videoIdFromParam = url.searchParams.get("v");
    if (videoIdFromParam && /^[a-zA-Z0-9_-]{11}$/.test(videoIdFromParam)) {
      return { platform: "youtube", channel: videoIdFromParam };
    }

    if (host === "youtu.be") {
      const vid = url.pathname.slice(1);
      if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) {
        return { platform: "youtube", channel: vid };
      }
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    if ((pathParts[0] === "live" || pathParts[0] === "embed") && pathParts[1]) {
      return { platform: "youtube", channel: pathParts[1] };
    }

    // 3.2 Channel page: search for active live broadcast playing in DOM
    const metaVideoId = document.querySelector('meta[itemprop="videoId"]')?.getAttribute("content");
    if (metaVideoId && /^[a-zA-Z0-9_-]{11}$/.test(metaVideoId)) {
      const isLive = !!(
        document.querySelector(".ytp-live-badge:not([disabled])") ||
        document.querySelector('meta[itemprop="isLiveBroadcast"][content="True"]') ||
        document.querySelector(".badge-style-type-live-now") ||
        document.querySelector("ytd-watch-flexy[is-live]")
      );
      if (isLive) {
        return { platform: "youtube", channel: metaVideoId };
      }
    }

    return null;
  }

  // 4. Custom: Hunt for genuine video player iframes
  const iframes = Array.from(document.querySelectorAll("iframe"));
  if (iframes.length > 0) {
    const candidates = iframes
      .map((iframe) => {
        const src = iframe.src || iframe.getAttribute("src") || iframe.getAttribute("data-src");
        if (!src || src.startsWith("about:blank") || src.startsWith("javascript:")) {
          return null;
        }

        // Filter out ad networks, trackers, widgets, and auth frames
        const isAdOrTracker =
          /(googleads|doubleclick|googletag|recaptcha|hcaptcha|turnstile|stripe|paypal|facebook|twitter|instagram|tiktok\.com\/embed|disqus|zendesk|intercom|crisp|trustpilot|spotify|soundcloud|hubspot|onetrust|cookie|analytics|adservice)/i.test(
            src
          );
        if (isAdOrTracker) return null;

        const rect = iframe.getBoundingClientRect();

        // Require minimum video player dimensions (>= 300x160 px)
        const isPlayerDimensions = rect.width >= 300 && rect.height >= 160;
        if (!isPlayerDimensions) return null;

        // Require video-like aspect ratio (landscape)
        const aspectRatio = rect.width / (rect.height || 1);
        if (aspectRatio < 1.1 || aspectRatio > 2.6) return null;

        // Require at least one definitive video player attribute
        const hasFullscreen =
          iframe.hasAttribute("allowfullscreen") ||
          iframe.hasAttribute("webkitallowfullscreen") ||
          iframe.hasAttribute("mozallowfullscreen");

        const allowAttr = (iframe.getAttribute("allow") || "").toLowerCase();
        const hasMediaPermissions =
          allowAttr.includes("autoplay") ||
          allowAttr.includes("fullscreen") ||
          allowAttr.includes("encrypted-media") ||
          allowAttr.includes("picture-in-picture");

        const hasVideoKeywords =
          /(player|embed|stream|live|m3u8|hls|video|watch|broadcast|reproductor|cdn|canal)/i.test(
            src
          );

        if (!hasFullscreen && !hasMediaPermissions && !hasVideoKeywords) {
          return null;
        }

        let score = rect.width * rect.height;
        if (hasFullscreen) score += 50000;
        if (hasMediaPermissions) score += 50000;
        if (hasVideoKeywords) score += 100000;

        return { src, score, iframe };
      })
      .filter(Boolean);

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0];
      const titleAttr = chosen.iframe.getAttribute("title") || "";
      const streamName = (titleAttr || document.title || "").trim();
      return {
        platform: "custom",
        iframeUrl: chosen.src,
        channel: streamName || undefined,
      };
    }
  }

  // 5. Check for active HTML5 <video> elements
  const videos = Array.from(document.querySelectorAll("video"));
  for (const v of videos) {
    if (v.autoplay && v.loop && !v.controls) continue;

    const rect = v.getBoundingClientRect();
    const isPlayerSize = rect.width >= 320 && rect.height >= 180;
    const videoSrc = v.currentSrc || v.src || v.querySelector("source")?.src;
    const isRealVideo = v.controls || !v.paused || (videoSrc && videoSrc.includes(".m3u8"));

    if (isPlayerSize && isRealVideo && videoSrc && videoSrc.startsWith("http")) {
      const streamName = (v.getAttribute("title") || document.title || "").trim();
      return {
        platform: "custom",
        iframeUrl: videoSrc,
        channel: streamName || undefined,
      };
    }
  }

  return null;
}

// Inject subtle toast notification into page
function showPageToast(message, isSuccess) {
  const existing = document.getElementById("multistream-extension-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "multistream-extension-toast";

  const dot = document.createElement("span");
  Object.assign(dot.style, {
    display: "inline-block",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: isSuccess ? "#34d399" : "#a1a1aa",
    marginRight: "10px",
    flexShrink: "0",
  });

  const textNode = document.createElement("span");
  textNode.textContent = message;

  toast.appendChild(dot);
  toast.appendChild(textNode);

  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    padding: "10px 16px",
    backgroundColor: "#14161a",
    color: "#e4e4e7",
    border: "1px solid #2a2d33",
    borderRadius: "10px",
    boxShadow: "0 8px 24px -4px rgba(0, 0, 0, 0.45)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "12px",
    fontWeight: "500",
    letterSpacing: "0.2px",
    transition: "opacity 0.25s ease, transform 0.25s ease",
    opacity: "0",
    transform: "translateY(8px)",
    pointerEvents: "none",
  });

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 250);
  }, 2500);
}

function safeBase64Encode(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

function buildDeepLink(result) {
  if (!result) return null;

  if (result.platform === "twitch") {
    return `multistream://add?streams=twitch:${result.channel}`;
  }
  if (result.platform === "kick") {
    return `multistream://add?streams=kick:${result.channel}`;
  }
  if (result.platform === "youtube") {
    return `multistream://add?streams=youtube:${result.channel}`;
  }
  if (result.platform === "custom" && result.iframeUrl) {
    const payload = safeBase64Encode(JSON.stringify([{ u: result.iframeUrl, n: result.channel }]));
    return `multistream://add?c=${encodeURIComponent(payload)}`;
  }

  return null;
}

function updateBadgeFeedback(tabId, isSuccess) {
  const text = isSuccess ? "✓" : "✕";
  const color = isSuccess ? "#059669" : "#3f3f46";

  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});

  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }, 2500);
}

async function handleStreamExtraction(tab, info) {
  if (!tab?.id) return;

  // 1. Direct right-click inside video iframe
  if (info?.frameUrl) {
    const parsed = extractFromUrlString(info.frameUrl);
    const deepLink = buildDeepLink(parsed);
    if (deepLink) {
      updateBadgeFeedback(tab.id, true);
      chrome.tabs.update(tab.id, { url: deepLink });
      return;
    }
  }

  // 2. Right-click on specific link
  if (info?.linkUrl) {
    const parsed = extractFromUrlString(info.linkUrl);
    if (parsed && parsed.platform !== "custom") {
      const deepLink = buildDeepLink(parsed);
      if (deepLink) {
        updateBadgeFeedback(tab.id, true);
        chrome.tabs.update(tab.id, { url: deepLink });
        return;
      }
    }
  }

  // 3. Active tab DOM inspection
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: inspectPageDOM,
    });

    const pageResult = results?.[0]?.result;
    const deepLink = buildDeepLink(pageResult);

    if (deepLink) {
      updateBadgeFeedback(tab.id, true);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showPageToast,
        args: ["Multistream: Adding stream to grid...", true],
      });
      chrome.tabs.update(tab.id, { url: deepLink });
    } else {
      updateBadgeFeedback(tab.id, false);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showPageToast,
        args: ["Multistream: No active live stream or player found on this page.", false],
      });
    }
  } catch (err) {
    console.warn("Multistream extension execution error:", err);
    updateBadgeFeedback(tab.id, false);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleStreamExtraction(tab, info);
});

chrome.action.onClicked.addListener((tab) => {
  handleStreamExtraction(tab, null);
});
