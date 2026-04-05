import { describe, it, expect } from "vitest";
import { parseUrlOptions as sut } from "../parseUrlOptions";

describe("parseUrlOptions util unit tests", () => {
  it("should return null when no query params are passed", () => {
    // Act
    const result = sut("");
    const result2 = sut("?other=123");

    // Assert
    expect(result).toBeNull();
    expect(result2).toBeNull();
  });

  it("should parse regular streams correctly from 'streams' param", () => {
    // Arrange
    const param = "twitch:gaules,kick:alanzoka,invalidstream";

    // Act
    const result = sut(`?streams=${encodeURIComponent(param)}`);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.length).toBe(2);
    expect(result?.[0]).toEqual({ channel: "gaules", platform: "twitch" });
    expect(result?.[1]).toEqual({ channel: "alanzoka", platform: "kick" });
  });

  it("should parse custom streams encoded in base64 'c' param", () => {
    // Arrange
    const customPayload = [
      { n: "My Custom", u: "https://my.iframe.url" },
      { n: "Another", u: "https://another.iframe.url" },
    ];
    // Create base64 representation of the JSON array
    const base64Param = btoa(JSON.stringify(customPayload));

    // Act
    const result = sut(`?c=${encodeURIComponent(base64Param)}`);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.length).toBe(2);
    expect(result?.[0]).toEqual({
      channel: "My Custom",
      platform: "custom",
      iframeUrl: "https://my.iframe.url",
    });
    expect(result?.[1]).toEqual({
      channel: "Another",
      platform: "custom",
      iframeUrl: "https://another.iframe.url",
    });
  });

  it("should fallback channel name to 'Custom Stream' if missing 'n' property but 'u' is present", () => {
    // Arrange
    const customPayload = [{ u: "https://my.iframe.url" }];
    const base64Param = btoa(JSON.stringify(customPayload));

    // Act
    const result = sut(`?c=${encodeURIComponent(base64Param)}`);

    // Assert
    expect(result?.[0]).toEqual({
      channel: "Custom Stream", // fallback behavior
      platform: "custom",
      iframeUrl: "https://my.iframe.url",
    });
  });

  it("should ignore custom stream objects that are missing the 'u' (URL) property", () => {
    // Arrange
    const customPayload = [{ n: "Invalid Stream without U" }];
    const base64Param = btoa(JSON.stringify(customPayload));

    // Act
    const result = sut(`?c=${encodeURIComponent(base64Param)}`);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.length).toBe(0); // the item was filtered out
  });

  it("should parse BOTH regular streams and custom streams simultaneously", () => {
    // Arrange
    const regular = "twitch:coreano";
    const customPayload = [{ u: "https://custom.com" }];
    const customBase64 = btoa(JSON.stringify(customPayload));

    // Act
    const result = sut(
      `?streams=${encodeURIComponent(regular)}&c=${encodeURIComponent(customBase64)}`,
    );

    // Assert
    expect(result?.length).toBe(2); // 1 regular + 1 custom
    expect(result?.[0]).toEqual({ channel: "coreano", platform: "twitch" });
    expect(result?.[1]).toEqual({
      channel: "Custom Stream",
      platform: "custom",
      iframeUrl: "https://custom.com",
    });
  });

  it("should throw an error if the base64 string is completely invalid", () => {
    expect(() => {
      sut("?c=NOT_A_BASE64_STRING_!");
    }).toThrow("Invalid custom streams payload");
  });

  it("should throw an error if the base64 contains invalid JSON", () => {
    const invalidJsonBase64 = btoa("{ invalid_json: ]");
    expect(() => {
      sut(`?c=${encodeURIComponent(invalidJsonBase64)}`);
    }).toThrow("Invalid custom streams payload");
  });

  it("should throw an error if the base64 parses to a JSON Object instead of an Array", () => {
    // Arrange
    const jsonObject = { n: "Stream", u: "https://iframe.url" };
    const base64Param = btoa(JSON.stringify(jsonObject));

    // Act & Assert
    expect(() => {
      sut(`?c=${encodeURIComponent(base64Param)}`);
    }).toThrow("Invalid custom streams payload");
  });

  it("should throw an error if a custom stream URL uses javascript: protocol", () => {
    // Arrange
    const maliciousPayload = [{ n: "Evil", u: "javascript:alert('xss')" }];
    const base64Param = btoa(JSON.stringify(maliciousPayload));

    // Act & Assert
    expect(() => {
      sut(`?c=${encodeURIComponent(base64Param)}`);
    }).toThrow("Invalid custom stream URL");
  });

  it("should throw an error if a custom stream URL uses data: protocol", () => {
    // Arrange
    const maliciousPayload = [{ n: "Evil", u: "data:text/html,<h1>evil</h1>" }];
    const base64Param = btoa(JSON.stringify(maliciousPayload));

    // Act & Assert
    expect(() => {
      sut(`?c=${encodeURIComponent(base64Param)}`);
    }).toThrow("Invalid custom stream URL");
  });

  it("should throw an error if a custom stream URL uses about: protocol", () => {
    // Arrange
    const maliciousPayload = [{ n: "Evil", u: "about:blank" }];
    const base64Param = btoa(JSON.stringify(maliciousPayload));

    // Act & Assert
    expect(() => {
      sut(`?c=${encodeURIComponent(base64Param)}`);
    }).toThrow("Invalid custom stream URL");
  });

  it("should accept http:// URLs as valid custom streams", () => {
    // Arrange
    const payload = [{ n: "Local Dev", u: "http://localhost:3000" }];
    const base64Param = btoa(JSON.stringify(payload));

    // Act
    const result = sut(`?c=${encodeURIComponent(base64Param)}`);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.length).toBe(1);
    expect(result?.[0]?.iframeUrl).toBe("http://localhost:3000");
  });

  it("should safely ignore malformed items in 'streams' parameter", () => {
    // Arrange
    // "kick:" has no channel
    // ":gaules" has no platform
    // "youtube:caze:extra" has extra parts, should just take platform and channel
    const param = "kick:,:gaules,youtube:caze:extra,twitch:mch";

    // Act
    const result = sut(`?streams=${encodeURIComponent(param)}`);

    // Assert
    expect(result).not.toBeNull();
    expect(result?.length).toBe(2);
    expect(result?.[0]).toEqual({ channel: "caze", platform: "youtube" });
    expect(result?.[1]).toEqual({ channel: "mch", platform: "twitch" });
  });
});
