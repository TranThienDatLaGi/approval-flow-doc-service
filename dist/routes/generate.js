"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRoutes = generateRoutes;
const uuid_1 = require("uuid");
const puppeteer_service_1 = require("../services/puppeteer.service");
const docxtemplater_service_1 = require("../services/docxtemplater.service");
const minio_service_1 = require("../services/minio.service");
async function generateRoutes(fastify) {
    /**
     * POST /generate
     * Điền field values vào template → xuất PDF + .docx
     *
     * Body JSON:
     * {
     *   template_html: string,        -- HTML template có chứa field tags
     *   original_docx_path: string,   -- Path .docx gốc trên MinIO
     *   field_values: Record<string, string>,
     *   output_formats: ['pdf', 'docx'],
     *   output_prefix?: string
     * }
     */
    fastify.post('/', async (request, reply) => {
        const { template_html, original_docx_path, field_values, output_formats = ['pdf', 'docx'], output_prefix = 'contract', } = request.body;
        if (!template_html) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'template_html là bắt buộc',
            });
        }
        if (!original_docx_path) {
            return reply.status(400).send({
                error: 'Bad Request',
                message: 'original_docx_path là bắt buộc',
            });
        }
        const outputId = (0, uuid_1.v4)();
        const result = { generated_id: outputId };
        // Generate PDF
        if (output_formats.includes('pdf')) {
            fastify.log.info({ outputId }, 'Generating PDF...');
            const pdfBuffer = await (0, puppeteer_service_1.renderHtmlToPdf)(template_html, field_values);
            const pdfObjectName = `contracts/generated/${outputId}/${output_prefix}.pdf`;
            result.pdf_path = await (0, minio_service_1.uploadBuffer)(pdfBuffer, pdfObjectName, 'application/pdf');
            fastify.log.info({ outputId, pdfPath: result.pdf_path }, 'PDF generated');
        }
        // Generate .docx
        if (output_formats.includes('docx')) {
            fastify.log.info({ outputId }, 'Generating DOCX...');
            // Download .docx template gốc từ MinIO
            const templateBuffer = await (0, minio_service_1.downloadBuffer)(original_docx_path);
            // Điền data vào template (dùng {{key}} syntax)
            const filledDocxBuffer = (0, docxtemplater_service_1.generateDocxFromTemplate)({
                templateBuffer,
                fieldValues: field_values,
            });
            const docxObjectName = `contracts/generated/${outputId}/${output_prefix}.docx`;
            result.docx_path = await (0, minio_service_1.uploadBuffer)(filledDocxBuffer, docxObjectName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            fastify.log.info({ outputId, docxPath: result.docx_path }, 'DOCX generated');
        }
        return reply.status(200).send(result);
    });
}
//# sourceMappingURL=generate.js.map