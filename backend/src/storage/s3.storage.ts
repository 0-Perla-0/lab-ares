import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { canonicalOperation } from "../common/domain/canonical-operation";
import type { Environment } from "../config/environment";
import type {
  ObjectStorage,
  StorageBucket,
  ObjectVersion,
} from "./storage.types";
import { ApiException } from "../common/errors/api.exception";

@Injectable()
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly downloadClient?: S3Client;
  private readonly buckets: Record<StorageBucket, string>;
  private readonly journalBucket: string;
  private readonly namespace: string;
  constructor(private readonly config: ConfigService<Environment, true>) {
    this.client = new S3Client({
      endpoint: config.get("S3_ENDPOINT"),
      region: config.get("S3_REGION"),
      forcePathStyle: config.get("S3_FORCE_PATH_STYLE"),
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY"),
        secretAccessKey: config.get("S3_SECRET_KEY"),
      },
    });
    const downloadEndpoint = config.get("S3_DOWNLOAD_ENDPOINT");
    if (downloadEndpoint)
      this.downloadClient = new S3Client({
        endpoint: downloadEndpoint,
        region: config.get("S3_REGION"),
        forcePathStyle: config.get("S3_FORCE_PATH_STYLE"),
        credentials: {
          accessKeyId: config.get("S3_ACCESS_KEY"),
          secretAccessKey: config.get("S3_SECRET_KEY"),
        },
      });
    this.buckets = {
      quarantine: config.get("S3_QUARANTINE_BUCKET"),
      available: config.get("S3_AVAILABLE_BUCKET"),
      public: config.get("S3_PUBLIC_BUCKET"),
    };
    this.journalBucket = config.get("S3_SUPPRESSION_JOURNAL_BUCKET");
    this.namespace = createHash("sha256")
      .update(
        canonicalOperation({
          endpoint: config.get("S3_ENDPOINT"),
          region: config.get("S3_REGION"),
          available: this.buckets.available,
          quarantine: this.buckets.quarantine,
          journal: this.journalBucket,
        }),
      )
      .digest("hex");
  }
  put(
    bucket: StorageBucket,
    key: string,
    body: Readable | Buffer,
    contentType?: string,
    contentLength?: number,
  ) {
    return this.client
      .send(
        new PutObjectCommand({
          Bucket: this.buckets[bucket],
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: contentLength,
        }),
      )
      .then(() => undefined);
  }
  async get(bucket: StorageBucket, key: string) {
    const r = await this.client.send(
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
    );
    return r.Body as Readable;
  }
  copy(
    from: StorageBucket,
    to: StorageBucket,
    key: string,
    destinationKey = key,
  ) {
    return this.client
      .send(
        new CopyObjectCommand({
          Bucket: this.buckets[to],
          Key: destinationKey,
          CopySource: `${this.buckets[from]}/${key}`,
        }),
      )
      .then(() => undefined);
  }
  delete(bucket: StorageBucket, key: string) {
    return this.client
      .send(new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }))
      .then(() => undefined);
  }
  async head(bucket: StorageBucket, key: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      return true;
    } catch (error) {
      const e = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
        Code?: string;
      };
      if (
        e.name === "NotFound" ||
        e.name === "NoSuchKey" ||
        e.Code === "NoSuchKey" ||
        e.$metadata?.httpStatusCode === 404
      )
        return false;
      throw error;
    }
  }
  /** Null when the object is absent; unknown age is reported as null by callers. */
  async lastModified(bucket: StorageBucket, key: string) {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      return head.LastModified ?? null;
    } catch (error) {
      const e = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        e.name === "NotFound" ||
        e.name === "NoSuchKey" ||
        e.$metadata?.httpStatusCode === 404
      )
        return null;
      throw error;
    }
  }
  async deletionVersions(
    bucket: StorageBucket,
    key: string,
    abortSignal: AbortSignal,
  ): Promise<ObjectVersion[]> {
    const versioning = await this.client.send(
      new GetBucketVersioningCommand({ Bucket: this.buckets[bucket] }),
      { abortSignal },
    );
    if (versioning.Status !== "Enabled")
      throw new ApiException("STORAGE_VERSIONING_REQUIRED", 409);
    const result = await this.client.send(
      new ListObjectVersionsCommand({
        Bucket: this.buckets[bucket],
        Prefix: key,
        MaxKeys: 1000,
      }),
      { abortSignal },
    );
    // A bounded, complete inventory is mandatory. Never silently purge only one
    // page or reveal an older version behind the current object.
    if (result.IsTruncated)
      throw new ApiException("OBJECT_DELETION_INVENTORY_TOO_LARGE", 409);
    const versions: ObjectVersion[] = [
      ...(result.Versions ?? [])
        .filter((row) => row.Key === key)
        .map((row) => ({
          id: row.VersionId ?? "",
          etag: row.ETag ?? null,
          deleteMarker: false,
        })),
      ...(result.DeleteMarkers ?? [])
        .filter((row) => row.Key === key)
        .map((row) => ({
          id: row.VersionId ?? "",
          etag: null,
          deleteMarker: true,
        })),
    ];
    if (versions.some((row) => !row.id || row.id === "null"))
      throw new ApiException("OBJECT_DELETION_UNVERSIONED_HISTORY", 409);
    return versions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  deletionNamespace() {
    // Bind physical endpoint/region/buckets, not rotating IAM credentials or the
    // public signing host. A changed alias must never redirect an old DELETE.
    return this.namespace;
  }
  async deleteVersion(
    bucket: StorageBucket,
    key: string,
    versionId: string,
    abortSignal: AbortSignal,
  ) {
    if (!versionId || versionId === "null")
      throw new ApiException("STORAGE_VERSIONING_REQUIRED", 409);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        VersionId: versionId,
      }),
      { abortSignal },
    );
  }
  async list(bucket: StorageBucket, cursor?: string, limit = 100) {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.buckets[bucket],
        ContinuationToken: cursor,
        MaxKeys: Math.min(1000, Math.max(1, limit)),
      }),
    );
    return {
      objects: (result.Contents ?? []).flatMap((item) =>
        item.Key ? [{ key: item.Key, lastModified: item.LastModified }] : [],
      ),
      nextCursor: result.IsTruncated ? result.NextContinuationToken : undefined,
    };
  }
  async health() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.buckets.quarantine }),
      );
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.buckets.available }),
      );
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.buckets.public }),
      );
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.journalBucket }),
      );
      return true;
    } catch {
      return false;
    }
  }
  putSuppressionJournal(key: string, body: Buffer, abortSignal?: AbortSignal) {
    return this.client
      .send(
        new PutObjectCommand({
          Bucket: this.journalBucket,
          Key: key,
          Body: body,
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
        { abortSignal },
      )
      .then(() => undefined);
  }
  async getSuppressionJournal(key: string, abortSignal?: AbortSignal) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.journalBucket, Key: key }),
      { abortSignal },
    );
    return result.Body as Readable;
  }
  async journalHealth() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.journalBucket }),
      );
      return true;
    } catch {
      return false;
    }
  }
  async listDeletionIntents(cursor?: string) {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.journalBucket,
        Prefix: "deletion-intents/",
        ContinuationToken: cursor,
        MaxKeys: 200,
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    return {
      keys: (result.Contents ?? []).flatMap((row) =>
        row.Key ? [row.Key] : [],
      ),
      nextCursor: result.IsTruncated ? result.NextContinuationToken : undefined,
    };
  }
  signedDownload(
    key: string,
    expiresIn = 300,
    filename = "download",
    contentType = "application/octet-stream",
  ) {
    return getSignedUrl(
      this.downloadClient ?? this.client,
      new GetObjectCommand({
        Bucket: this.buckets.available,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        ResponseContentType: contentType,
      }),
      { expiresIn },
    );
  }
  signedPublic(
    key: string,
    expiresIn = 900,
    contentType = "application/octet-stream",
  ) {
    return getSignedUrl(
      this.downloadClient ?? this.client,
      new GetObjectCommand({
        Bucket: this.buckets.public,
        Key: key,
        ResponseContentDisposition: "inline",
        ResponseContentType: contentType,
      }),
      { expiresIn },
    );
  }
}
