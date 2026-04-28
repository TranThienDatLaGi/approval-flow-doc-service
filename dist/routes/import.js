"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importRoutes = importRoutes;
const uuid_1 = require("uuid");
const mammoth_service_1 = require("../services/mammoth.service");
const minio_service_1 = require("../services/minio.service");
async function importRoutes(fastify) {
    /**
     * POST /import
     * Upload .docx → convert sang HTML + lưu file gốc lên MinIO
     *
     * Body: multipart form-data với field "file" (.docx)
     * Response: { template_id, html, original_docx_path, messages }
     */
    fastify.post('/', async (request, reply) => {
        const data = await request.file();
        if (!data) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Không tìm thấy file trong request. Gửi multipart form-data với field "file".',
            });
        }
        const filename = data.filename || 'template.docx';
        const mimetype = data.mimetype || '';
        // Validate file type
        if (!mimetype.includes('officedocument.wordprocessingml') &&
            !filename.endsWith('.docx')) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'Chỉ chấp nhận file .docx',
            });
        }
        // Đọc toàn bộ file vào buffer
        const chunks = [];
        for await (const chunk of data.file) {
            chunks.push(chunk);
        }
        const fileBuffer = Buffer.concat(chunks);
        if (fileBuffer.length === 0) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'File rỗng',
            });
        }
        // Convert .docx → HTML
        const { html, messages } = await (0, mammoth_service_1.convertDocxToHtml)(fileBuffer);
        // Upload file .docx gốc lên MinIO
        const templateId = (0, uuid_1.v4)();
        const objectName = `contract-templates/originals/${templateId}/${filename}`;
        const originalDocxPath = await (0, minio_service_1.uploadBuffer)(fileBuffer, objectName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        fastify.log.info({
            templateId,
            filename,
            htmlLength: html.length,
            warnings: messages.filter((m) => m.type === 'warning').length,
        }, 'Import docx completed');
        return reply.status(200).send({
            template_id: templateId,
            html,
            original_docx_path: originalDocxPath,
            original_filename: filename,
            messages: messages.map((m) => ({
                type: m.type,
                message: m.message,
            })),
        });
    });
}
//# sourceMappingURL=import.js.map