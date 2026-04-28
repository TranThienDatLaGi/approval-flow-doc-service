import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { renderHtmlToPdf } from '../services/puppeteer.service';
import { generateDocxFromTemplate } from '../services/docxtemplater.service';
import { uploadBuffer, downloadBuffer } from '../services/minio.service';

interface GenerateBody {
  template_html: string;
  original_docx_path: string;
  field_values: Record<string, string>;
  output_formats?: ('pdf' | 'docx')[];
  output_prefix?: string; // prefix cho tên file output
}

export async function generateRoutes(fastify: FastifyInstance) {
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
  fastify.post(
    '/',
    async (
      request: FastifyRequest<{ Body: GenerateBody }>,
      reply: FastifyReply
    ) => {
      const {
        template_html,
        original_docx_path,
        field_values,
        output_formats = ['pdf', 'docx'],
        output_prefix = 'contract',
      } = request.body;

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

      const outputId = uuidv4();
      const result: {
        pdf_path?: string;
        docx_path?: string;
        generated_id: string;
      } = { generated_id: outputId };

      // Generate PDF
      if (output_formats.includes('pdf')) {
        fastify.log.info({ outputId }, 'Generating PDF...');
        const pdfBuffer = await renderHtmlToPdf(template_html, field_values);
        const pdfObjectName = `contracts/generated/${outputId}/${output_prefix}.pdf`;
        result.pdf_path = await uploadBuffer(
          pdfBuffer,
          pdfObjectName,
          'application/pdf'
        );
        fastify.log.info({ outputId, pdfPath: result.pdf_path }, 'PDF generated');
      }

      // Generate .docx
      if (output_formats.includes('docx')) {
        fastify.log.info({ outputId }, 'Generating DOCX...');

        // Download .docx template gốc từ MinIO
        const templateBuffer = await downloadBuffer(original_docx_path);

        // Điền data vào template (dùng {{key}} syntax)
        const filledDocxBuffer = generateDocxFromTemplate({
          templateBuffer,
          fieldValues: field_values,
        });

        const docxObjectName = `contracts/generated/${outputId}/${output_prefix}.docx`;
        result.docx_path = await uploadBuffer(
          filledDocxBuffer,
          docxObjectName,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        fastify.log.info({ outputId, docxPath: result.docx_path }, 'DOCX generated');
      }

      return reply.status(200).send(result);
    }
  );
}
