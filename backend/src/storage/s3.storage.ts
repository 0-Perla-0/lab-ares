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
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import type { Environment } from "../config/environment";
import type { ObjectStorage, StorageBucket } from "./storage.types";

@Injectable()
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly buckets: Record<StorageBucket, string>;
  private readonly journalBucket: string;
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
    this.buckets = {
      quarantine: config.get("S3_QUARANTINE_BUCKET"),
      available: config.get("S3_AVAILABLE_BUCKET"),
      public: config.get("S3_PUBLIC_BUCKET"),
    };
    this.journalBucket = config.get("S3_SUPPRESSION_JOURNAL_BUCKET");
  }
  put(
    bucket: StorageBucket,
    key: string,
    body: Readable | Buffer,
    contentType?: string,
  ) {
    return this.client
      .send(
        new PutObjectCommand({
          Bucket: this.buckets[bucket],
          Key: key,
          Body: body,
          ContentType: contentType,
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
  putSuppressionJournal(key: string, body: Buffer) {
    return this.client
      .send(
        new PutObjectCommand({
          Bucket: this.journalBucket,
          Key: key,
          Body: body,
          ContentType: "application/json",
          IfNoneMatch: "*",
        }),
      )
      .then(() => undefined);
  }
  async getSuppressionJournal(key: string) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.journalBucket, Key: key }),
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
  signedDownload(
    key: string,
    expiresIn = 300,
    filename = "download",
    contentType = "application/octet-stream",
  ) {
    return getSignedUrl(
      this.client,
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
      this.client,
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
