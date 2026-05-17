import { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { scanDocxPlaceholders, stripPlaceholdersFromDocx } from '../services/scanner.service';
import { uploadBuffer } from '../services/minio.service';

/**
 * POST /scan
 * Upload file .docx → trả về danh sách placeholders {{key}} + repeating tables {{#key}}...{{/key}}
 * + preview_docx_url (file DOCX đã strip {{...}} → ___)
 * Content-Type: multipart/form-data (field "file")
 */
export async function scanRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        error: 'Vui lòng upload file .docx',
      });
    }

    const filename = data.filename?.toLowerCase() || '';
    if (!filename.endsWith('.docx')) {
      return reply.status(400).send({
        error: 'Chỉ hỗ trợ file .docx',
      });
    }

    try {
      const buffer = await data.toBuffer();
      const { placeholders, tables } = scanDocxPlaceholders(buffer);

      // Tạo bản DOCX "sạch" (strip placeholders + loop markers → ___)
      let preview_docx_url = '';
      try {
        const cleanBuffer = stripPlaceholdersFromDocx(buffer);
        const outputId = uuidv4();
        const objectName = `workflows/preview/${outputId}/preview.docx`;
        preview_docx_url = await uploadBuffer(
          cleanBuffer,
          objectName,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        request.log.info({ objectName }, 'Preview DOCX uploaded');
      } catch (err) {
        request.log.warn(err, 'Không thể tạo preview DOCX, bỏ qua');
      }

      return reply.send({
        filename: data.filename,
        total_placeholders: placeholders.length,
        total_tables: tables.length,
        placeholders,
        tables,
        preview_docx_url,
      });
    } catch (err: any) {
      request.log.error(err, 'Lỗi scan docx');
      return reply.status(500).send({
        error: 'Không thể quét file template',
        detail: err.message,
      });
    }
  });
}
