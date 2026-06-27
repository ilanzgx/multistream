import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useProfilePicture } from "../useProfilePicture";

vi.mock("@/lib/http", () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
}));

vi.mock("@/config/api", () => ({
  API_CONFIG: {
    twitch: {
      gqlUrl: "https://gql.twitch.tv/gql",
      clientId: "test-client-id",
    },
    kick: {
      apiBaseUrl: "https://kick.com/api/v2/channels",
    },
  },
}));

import { httpGet, httpPost } from "@/lib/http";

const mockHttpPost = vi.mocked(httpPost);
const mockHttpGet = vi.mocked(httpGet);

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("useProfilePicture", () => {
  let sut: ReturnType<typeof useProfilePicture>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = useProfilePicture();
    sut.cache.value.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Twitch", () => {
    it("resolves the profile picture URL from the GQL response", async () => {
      // Arrange
      mockHttpPost.mockResolvedValueOnce(
        makeFetchResponse({
          data: { user: { profileImageURL: "https://cdn.twitch.tv/gaules.png" } },
        })
      );

      // Act
      const picture = sut.getProfilePicture("gaules", "twitch");
      await vi.waitUntil(() => picture.value !== null);

      // Assert
      expect(picture.value).toBe("https://cdn.twitch.tv/gaules.png");
    });

    it("sends the channel login lowercased in the GQL query", async () => {
      // Arrange
      mockHttpPost.mockResolvedValueOnce(
        makeFetchResponse({
          data: { user: { profileImageURL: "https://cdn.twitch.tv/ninja.png" } },
        })
      );

      // Act
      sut.getProfilePicture("NINJA", "twitch");
      await vi.waitUntil(() => mockHttpPost.mock.calls.length > 0);

      // Assert
      const body = JSON.parse(mockHttpPost.mock.calls[0]![1] as string);
      expect(body.query).toContain('"ninja"');
    });

    it("returns null when the GQL response is not ok", async () => {
      // Arrange
      mockHttpPost.mockResolvedValueOnce(makeFetchResponse({}, 500));

      // Act
      const picture = sut.getProfilePicture("gaules", "twitch");
      await vi.waitUntil(() => mockHttpPost.mock.calls.length > 0);
      await new Promise((r) => setTimeout(r, 10));

      // Assert
      expect(picture.value).toBeNull();
    });

    it("returns null when the user field is absent in the GQL response", async () => {
      // Arrange
      mockHttpPost.mockResolvedValueOnce(makeFetchResponse({ data: { user: null } }));

      // Act
      const picture = sut.getProfilePicture("unknownchannel", "twitch");
      await vi.waitUntil(() => mockHttpPost.mock.calls.length > 0);
      await new Promise((r) => setTimeout(r, 10));

      // Assert
      expect(picture.value).toBeNull();
    });

    it("returns null on network error", async () => {
      // Arrange
      mockHttpPost.mockRejectedValueOnce(new Error("Network failure"));

      // Act
      const picture = sut.getProfilePicture("gaules", "twitch");
      await vi.waitUntil(() => mockHttpPost.mock.calls.length > 0);
      await new Promise((r) => setTimeout(r, 10));

      // Assert
      expect(picture.value).toBeNull();
    });

    it("serves the cached URL on subsequent calls without a new network request", async () => {
      // Arrange
      mockHttpPost.mockResolvedValueOnce(
        makeFetchResponse({
          data: { user: { profileImageURL: "https://cdn.twitch.tv/gaules.png" } },
        })
      );

      // Act – first call populates the cache
      const first = sut.getProfilePicture("gaules", "twitch");
      await vi.waitUntil(() => first.value !== null);

      const second = sut.getProfilePicture("gaules", "twitch");

      // Assert
      expect(second.value).toBe("https://cdn.twitch.tv/gaules.png");
      expect(mockHttpPost).toHaveBeenCalledTimes(1);
    });

    it("treats channel names case-insensitively for cache lookup", async () => {
      // Arrange
      mockHttpPost.mockResolvedValueOnce(
        makeFetchResponse({
          data: { user: { profileImageURL: "https://cdn.twitch.tv/gaules.png" } },
        })
      );

      // Act
      const first = sut.getProfilePicture("Gaules", "twitch");
      await vi.waitUntil(() => first.value !== null);

      const second = sut.getProfilePicture("GAULES", "twitch");

      // Assert
      expect(second.value).toBe("https://cdn.twitch.tv/gaules.png");
      expect(mockHttpPost).toHaveBeenCalledTimes(1);
    });
  });

  describe("Kick", () => {
    it("resolves the profile picture URL from the channel API response", async () => {
      // Arrange
      mockHttpGet.mockResolvedValueOnce(
        makeFetchResponse({ user: { profile_pic: "https://cdn.kick.com/kk_avatar.jpg" } })
      );

      // Act
      const picture = sut.getProfilePicture("somekicker", "kick");
      await vi.waitUntil(() => picture.value !== null);

      // Assert
      expect(picture.value).toBe("https://cdn.kick.com/kk_avatar.jpg");
    });

    it("calls the correct Kick API endpoint with the channel slug lowercased", async () => {
      // Arrange
      mockHttpGet.mockResolvedValueOnce(
        makeFetchResponse({ user: { profile_pic: "https://cdn.kick.com/kk_avatar.jpg" } })
      );

      // Act
      sut.getProfilePicture("SOMEKICKER", "kick");
      await vi.waitUntil(() => mockHttpGet.mock.calls.length > 0);

      // Assert
      expect(mockHttpGet.mock.calls[0]![0]).toContain("somekicker");
    });

    it("returns null when the Kick API response is not ok", async () => {
      // Arrange
      mockHttpGet.mockResolvedValueOnce(makeFetchResponse({}, 404));

      // Act
      const picture = sut.getProfilePicture("notfound", "kick");
      await vi.waitUntil(() => mockHttpGet.mock.calls.length > 0);
      await new Promise((r) => setTimeout(r, 10));

      // Assert
      expect(picture.value).toBeNull();
    });

    it("returns null when user.profile_pic is absent in the Kick response", async () => {
      // Arrange
      mockHttpGet.mockResolvedValueOnce(makeFetchResponse({ user: {} }));

      // Act
      const picture = sut.getProfilePicture("somekicker", "kick");
      await vi.waitUntil(() => mockHttpGet.mock.calls.length > 0);
      await new Promise((r) => setTimeout(r, 10));

      // Assert
      expect(picture.value).toBeNull();
    });

    it("returns null on network error", async () => {
      // Arrange
      mockHttpGet.mockRejectedValueOnce(new Error("Network failure"));

      // Act
      const picture = sut.getProfilePicture("somekicker", "kick");
      await vi.waitUntil(() => mockHttpGet.mock.calls.length > 0);
      await new Promise((r) => setTimeout(r, 10));

      // Assert
      expect(picture.value).toBeNull();
    });
  });

  describe("Unsupported platforms", () => {
    it("returns null immediately for youtube without making any network request", () => {
      // Arrange & Act
      const picture = sut.getProfilePicture("somechannel", "youtube");

      // Assert
      expect(picture.value).toBeNull();
      expect(mockHttpGet).not.toHaveBeenCalled();
      expect(mockHttpPost).not.toHaveBeenCalled();
    });

    it("returns null immediately for custom without making any network request", () => {
      // Arrange & Act
      const picture = sut.getProfilePicture("somechannel", "custom");

      // Assert
      expect(picture.value).toBeNull();
      expect(mockHttpGet).not.toHaveBeenCalled();
      expect(mockHttpPost).not.toHaveBeenCalled();
    });
  });

  describe("Cache isolation between platforms", () => {
    it("stores separate cache entries for the same channel name on different platforms", async () => {
      // Arrange
      mockHttpPost.mockResolvedValueOnce(
        makeFetchResponse({
          data: { user: { profileImageURL: "https://cdn.twitch.tv/ninja.png" } },
        })
      );
      mockHttpGet.mockResolvedValueOnce(
        makeFetchResponse({ user: { profile_pic: "https://cdn.kick.com/ninja.jpg" } })
      );

      // Act
      const twitch = sut.getProfilePicture("ninja", "twitch");
      const kick = sut.getProfilePicture("ninja", "kick");
      await vi.waitUntil(() => twitch.value !== null);
      await vi.waitUntil(() => kick.value !== null);

      // Assert
      expect(twitch.value).toBe("https://cdn.twitch.tv/ninja.png");
      expect(kick.value).toBe("https://cdn.kick.com/ninja.jpg");
    });
  });
});
