"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureBucket = ensureBucket;
exports.uploadBuffer = uploadBuffer;
exports.downloadBuffer = downloadBuffer;
exports.getPresignedUrl = getPresignedUrl;
const minio_1 = require("minio");
const minioClient = new minio_1.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});
const DEFAULT_BUCKET = process.env.MINIO_BUCKET || 'file-upload';
async function ensureBucket(bucket = DEFAULT_BUCKET) {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
        await minioClient.makeBucket(bucket, 'us-east-1');
    }
}
async function uploadBuffer(buffer, objectName, contentType, bucket = DEFAULT_BUCKET) {
    await ensureBucket(bucket);
    await minioClient.putObject(bucket, objectName, buffer, buffer.length, {
        'Content-Type': contentType,
    });
    return `/${bucket}/${objectName}`;
}
async function downloadBuffer(objectPath) {
    // objectPath format: "/bucket-name/path/to/file"
    const parts = objectPath.replace(/^\//, '').split('/');
    const bucket = parts[0];
    const objectName = parts.slice(1).join('/');
    const stream = await minioClient.getObject(bucket, objectName);
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}
async function getPresignedUrl(objectPath, expiry = 3600) {
    const parts = objectPath.replace(/^\//, '').split('/');
    const bucket = parts[0];
    const objectName = parts.slice(1).join('/');
    return await minioClient.presignedGetObject(bucket, objectName, expiry);
}
exports.default = minioClient;
//# sourceMappingURL=minio.service.js.map