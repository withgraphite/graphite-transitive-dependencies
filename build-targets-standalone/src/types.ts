/**
 * Storage client interface - implement this for your storage backend (S3, GCS, etc.)
 */
export type StorageClient = {
  getObjectOrNull: (key: string) => Promise<{ data: Buffer | string } | null>;
};

/**
 * Non-empty array type for compile-time safety
 */
export type NonEmptyArray<T> = [T, ...T[]];
