import { describe, expect, it, vi } from "vitest";
import { S3Storage } from "../../../src/storage/s3.storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn().mockResolvedValue("https://signed") }));
const cfg = { get: (k: string) => ({ S3_ENDPOINT: "http://s3", S3_REGION: "us-east-1", S3_FORCE_PATH_STYLE: true, S3_ACCESS_KEY: "a", S3_SECRET_KEY: "b", S3_QUARANTINE_BUCKET: "q", S3_AVAILABLE_BUCKET: "a" } as any)[k] } as never;
describe("S3Storage", () => {
  it("lists pages and exposes lastModified", async () => {
    const s: any = new S3Storage(cfg); s.client = { send: vi.fn().mockResolvedValue({ Contents: [{ Key: "k", LastModified: new Date(1) }], IsTruncated: true, NextContinuationToken: "next" }) };
    await expect(s.list("quarantine", undefined, 10)).resolves.toEqual({ objects: [{ key: "k", lastModified: new Date(1) }], nextCursor: "next" });
    expect(s.client.send).toHaveBeenCalled();
  });
  it("uses response download overrides for signed URLs", async () => {
    const s: any = new S3Storage(cfg); s.client = {};
    await expect(s.signedDownload("k", 60, "x.pdf", "application/pdf")).resolves.toBe("https://signed");
    expect(getSignedUrl).toHaveBeenCalledWith(s.client, expect.objectContaining({ input: expect.objectContaining({ ResponseContentType: "application/pdf", ResponseContentDisposition: expect.stringContaining("x.pdf") }) }), { expiresIn: 60 });
  });
  it("propagates list errors for readiness/reconciliation", async () => {
    const s: any = new S3Storage(cfg); s.client = { send: vi.fn().mockRejectedValue(new Error("offline")) };
    await expect(s.list("available")).rejects.toThrow("offline");
  });
});
