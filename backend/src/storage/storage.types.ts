import { Readable } from "node:stream";

export type StorageBucket = "quarantine" | "available";
declare const capabilityBrand: unique symbol;
export type DownloadCapability = Readonly<{ subjectId: string; resourceId: string; purpose: "download"; issuedAt: Date }> & { readonly [capabilityBrand]: "DownloadCapability" };
export function issueDownloadCapability(input: Omit<DownloadCapability, typeof capabilityBrand>): DownloadCapability { return Object.freeze({ ...input }) as DownloadCapability; }
export interface ObjectStorage {
  put(bucket: StorageBucket, key: string, body: Readable | Buffer, contentType?: string): Promise<void>;
  get(bucket: StorageBucket, key: string): Promise<Readable>;
  copy(from: StorageBucket, to: StorageBucket, key: string): Promise<void>;
  delete(bucket: StorageBucket, key: string): Promise<void>;
  head(bucket: StorageBucket, key: string): Promise<boolean>;
  list(bucket: StorageBucket, cursor?: string, limit?: number): Promise<{ objects: Array<{ key: string; lastModified?: Date }>; nextCursor?: string }>;
  health(): Promise<boolean>;
  signedDownload(key: string, expiresIn?: number, filename?: string, contentType?: string): Promise<string>;
}

export interface MalwareScanner { scan(stream: Readable): Promise<{ clean: boolean; signature?: string }>; health(): Promise<boolean>; }
