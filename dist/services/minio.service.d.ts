import { Client } from 'minio';
declare const minioClient: Client;
export declare function ensureBucket(bucket?: string): Promise<void>;
export declare function uploadBuffer(buffer: Buffer, objectName: string, contentType: string, bucket?: string): Promise<string>;
export declare function downloadBuffer(objectPath: string): Promise<Buffer>;
export declare function getPresignedUrl(objectPath: string, expiry?: number): Promise<string>;
export default minioClient;
//# sourceMappingURL=minio.service.d.ts.map