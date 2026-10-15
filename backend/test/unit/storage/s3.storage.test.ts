import { describe, expect, it, vi } from "vitest";
import { S3Storage } from "../../../src/storage/s3.storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed"),
}));
const cfg = {
  get: (k: string) =>
    (
      ({
        S3_ENDPOINT: "http://s3",
        S3_REGION: "us-east-1",
        S3_FORCE_PATH_STYLE: true,
        S3_ACCESS_KEY: "a",
        S3_SECRET_KEY: "b",
        S3_QUARANTINE_BUCKET: "q",
        S3_AVAILABLE_BUCKET: "a",
      }) as any
    )[k],
} as never;
describe("S3Storage", () => {
  it("lists pages and exposes lastModified", async () => {
    const s: any = new S3Storage(cfg);
    s.client = {
      send: vi.fn().mockResolvedValue({
        Contents: [{ Key: "k", LastModified: new Date(1) }],
        IsTruncated: true,
        NextContinuationToken: "next",
      }),
    };
    await expect(s.list("quarantine", undefined, 10)).resolves.toEqual({
      objects: [{ key: "k", lastModified: new Date(1) }],
      nextCursor: "next",
    });
    expect(s.client.send).toHaveBeenCalled();
  });
  it("uses response download overrides for signed URLs", async () => {
    const s: any = new S3Storage(cfg);
    s.client = {};
    await expect(
      s.signedDownload("k", 60, "x.pdf", "application/pdf"),
    ).resolves.toBe("https://signed");
    expect(getSignedUrl).toHaveBeenCalledWith(
      s.client,
      expect.objectContaining({
        input: expect.objectContaining({
          ResponseContentType: "application/pdf",
          ResponseContentDisposition: expect.stringContaining("x.pdf"),
        }),
      }),
      { expiresIn: 60 },
    );
  });
  it("propagates list errors for readiness/reconciliation", async () => {
    const s: any = new S3Storage(cfg);
    s.client = { send: vi.fn().mockRejectedValue(new Error("offline")) };
    await expect(s.list("available")).rejects.toThrow("offline");
  });
  it("signs the external endpoint directly without changing the internal storage client", async () => {
    const config: any = {
      get: (key: string) =>
        key === "S3_DOWNLOAD_ENDPOINT"
          ? "https://private-downloads.example.test"
          : (cfg as any).get(key),
    };
    const storage: any = new S3Storage(config);
    expect(await storage.client.config.endpoint()).toMatchObject({
      hostname: "s3",
    });
    expect(await storage.downloadClient.config.endpoint()).toMatchObject({
      hostname: "private-downloads.example.test",
    });
    await storage.signedDownload("private/file", 60);
    expect(getSignedUrl).toHaveBeenLastCalledWith(
      storage.downloadClient,
      expect.anything(),
      { expiresIn: 60 },
    );
  });
  it("inventories exact versions and delete markers without including prefix neighbors", async () => {
    const s: any = new S3Storage(cfg);
    s.client = {
      send: vi
        .fn()
        .mockResolvedValueOnce({ Status: "Enabled" })
        .mockResolvedValueOnce({
          Versions: [
            { Key: "k", VersionId: "v2", ETag: '"b"' },
            { Key: "k-neighbor", VersionId: "foreign", ETag: '"x"' },
          ],
          DeleteMarkers: [{ Key: "k", VersionId: "v1" }],
        }),
    };
    expect(
      await s.deletionVersions("available", "k", AbortSignal.timeout(10000)),
    ).toEqual([
      { id: "v1", etag: null, deleteMarker: true },
      { id: "v2", etag: '"b"', deleteMarker: false },
    ]);
  });
  it.each([undefined, "Suspended"])(
    "refuses non-enabled versioning: %s",
    async (status) => {
      const s: any = new S3Storage(cfg);
      s.client = { send: vi.fn().mockResolvedValue({ Status: status }) };
      await expect(
        s.deletionVersions("available", "k", AbortSignal.timeout(10000)),
      ).rejects.toMatchObject({ code: "STORAGE_VERSIONING_REQUIRED" });
      expect(s.client.send).toHaveBeenCalledOnce();
    },
  );
  it("refuses incomplete version inventories and unversioned history", async () => {
    const s: any = new S3Storage(cfg);
    s.client = {
      send: vi
        .fn()
        .mockResolvedValueOnce({ Status: "Enabled" })
        .mockResolvedValueOnce({ IsTruncated: true }),
    };
    await expect(
      s.deletionVersions("available", "k", AbortSignal.timeout(10000)),
    ).rejects.toMatchObject({ code: "OBJECT_DELETION_INVENTORY_TOO_LARGE" });
    s.client.send
      .mockResolvedValueOnce({ Status: "Enabled" })
      .mockResolvedValueOnce({ Versions: [{ Key: "k", VersionId: "null" }] });
    await expect(
      s.deletionVersions("available", "k", AbortSignal.timeout(10000)),
    ).rejects.toMatchObject({ code: "OBJECT_DELETION_UNVERSIONED_HISTORY" });
  });
  it("DELETE always carries an exact non-null VersionId", async () => {
    const s: any = new S3Storage(cfg),
      signal = AbortSignal.timeout(10000);
    s.client = { send: vi.fn().mockResolvedValue({}) };
    await s.deleteVersion("available", "k", "version-1", signal);
    expect(s.client.send.mock.calls[0][0].input).toMatchObject({
      Key: "k",
      VersionId: "version-1",
    });
    expect(s.client.send.mock.calls[0][1]).toEqual({ abortSignal: signal });
    await expect(
      s.deleteVersion("available", "k", "null", signal),
    ).rejects.toMatchObject({ code: "STORAGE_VERSIONING_REQUIRED" });
    expect(s.client.send).toHaveBeenCalledOnce();
  });
});
