import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { renderHtmlToPdf } from '../services/puppeteer.service';
import { generateDocxFromTemplate } from '../services/docxtemplater.service';
import { uploadBuffer, downloadBuffer } from '../services/minio.service';
import { PDFDocument } from 'pdf-lib';

interface GenerateBody {
  template_html: string;
  original_docx_path: string;
  field_values: Record<string, string>;
  output_formats?: ('pdf' | 'docx')[];
  output_prefix?: string;
}

// ─── /generate/contract-pdf ────────────────────────────────────────────────
interface ContractPdfBody {
  docx_minio_key: string;
  field_values: Record<string, string>;
}

// ─── /generate/embed-signature ────────────────────────────────────────────
interface SignatureEntry {
  signature_url: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface EmbedSignatureBody {
  pdf_minio_key: string;
  signatures: SignatureEntry[];
}

export async function generateRoutes(fastify: FastifyInstance) {
  // ── POST /generate (existing) ─────────────────────────────────────────────
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
        return reply.status(400).send({ error: 'Bad Request', message: 'template_html là bắt buộc' });
      }
      if (!original_docx_path) {
        return reply.status(400).send({ error: 'Bad Request', message: 'original_docx_path là bắt buộc' });
      }

      const outputId = uuidv4();
      const result: { pdf_path?: string; docx_path?: string; generated_id: string } = { generated_id: outputId };

      if (output_formats.includes('pdf')) {
        fastify.log.info({ outputId }, 'Generating PDF...');
        const pdfBuffer = await renderHtmlToPdf(template_html, field_values);
        const pdfObjectName = `contracts/generated/${outputId}/${output_prefix}.pdf`;
        result.pdf_path = await uploadBuffer(pdfBuffer, pdfObjectName, 'application/pdf');
        fastify.log.info({ outputId, pdfPath: result.pdf_path }, 'PDF generated');
      }

      if (output_formats.includes('docx')) {
        fastify.log.info({ outputId }, 'Generating DOCX...');
        const templateBuffer = await downloadBuffer(original_docx_path);
        const filledDocxBuffer = generateDocxFromTemplate({ templateBuffer, fieldValues: field_values });
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

  // ── POST /generate/contract-pdf ─────────────────────────────────────────
  // Nhận docx_minio_key + field_values → fill {{key}} → HTML → PDF → trả URL
  fastify.post<{ Body: ContractPdfBody }>(
    '/contract-pdf',
    async (request, reply) => {
      const { docx_minio_key, field_values } = request.body;

      if (!docx_minio_key || !field_values) {
        return reply.status(400).send({ error: 'docx_minio_key và field_values là bắt buộc' });
      }

      try {
        // 1. Download docx từ MinIO
        const templateBuffer = await downloadBuffer(docx_minio_key);

        // 2. Docxtemplater: fill {{key}} → docx buffer đã điền
        const filledDocxBuffer = generateDocxFromTemplate({ templateBuffer, fieldValues: field_values });

        // 3. Mammoth: docx → HTML
        const mammoth = await import('mammoth');
        const { value: html } = await mammoth.convertToHtml({ buffer: filledDocxBuffer });

        // 4. Styled HTML để giữ format gần giống Word
        const styledHtml = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<style>
  body { font-family: 'Times New Roman', Times, serif; font-size: 13pt;
         line-height: 1.8; max-width: 800px; margin: 0 auto;
         padding: 40px 60px; color: #1a1a1a; }
  p { margin: 0 0 8px; text-align: justify; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #555; padding: 6px 10px; }
  strong { font-weight: 700; }
</style></head><body>${html}</body></html>`;

        // 5. Puppeteer: HTML → PDF
        const pdfBuffer = await renderHtmlToPdf(styledHtml, {});

        // 6. Upload PDF lên MinIO
        const outputId = uuidv4();
        const pdfKey = `contracts/preview/${outputId}/contract.pdf`;
        const pdfUrl = await uploadBuffer(pdfBuffer, pdfKey, 'application/pdf');

        fastify.log.info({ pdfKey }, 'Contract PDF generated');
        return reply.status(200).send({ pdf_url: pdfUrl, pdf_minio_key: pdfKey });
      } catch (err: any) {
        fastify.log.error(err, 'Lỗi generate contract PDF');
        return reply.status(500).send({ error: err.message || 'Internal Server Error' });
      }
    }
  );

  // ── POST /generate/embed-signature ────────────────────────────────────────
  // Embed ảnh chữ ký vào đúng tọa độ trên PDF, trả về PDF đã ký
  fastify.post<{ Body: EmbedSignatureBody }>(
    '/embed-signature',
    async (request, reply) => {
      const { pdf_minio_key, signatures } = request.body;

      if (!pdf_minio_key || !signatures?.length) {
        return reply.status(400).send({ error: 'pdf_minio_key và signatures là bắt buộc' });
      }

      try {
        // 1. Download PDF từ MinIO
        const pdfBuffer = await downloadBuffer(pdf_minio_key);
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();

        for (const sig of signatures) {
          const pageIndex = Math.max(0, (sig.page || 1) - 1);
          if (pageIndex >= pages.length) continue;

          const page = pages[pageIndex];
          const { height: pageHeight } = page.getSize();

          // 2. Download ảnh chữ ký
          let sigBuffer: Buffer;
          if (sig.signature_url.startsWith('http')) {
            const res = await fetch(sig.signature_url);
            sigBuffer = Buffer.from(await res.arrayBuffer());
          } else {
            sigBuffer = await downloadBuffer(sig.signature_url);
          }

          // 3. Embed ảnh (auto-detect PNG/JPG)
          let embeddedImg;
          try {
            embeddedImg = await pdfDoc.embedPng(sigBuffer);
          } catch {
            embeddedImg = await pdfDoc.embedJpg(sigBuffer);
          }

          // 4. Tọa độ PDF: gốc ở góc dưới trái → convert Y từ top-down
          const sigHeight = sig.height || 60;
          const pdfY = pageHeight - sig.y - sigHeight;

          page.drawImage(embeddedImg, {
            x: sig.x,
            y: pdfY,
            width: sig.width || 200,
            height: sigHeight,
            opacity: 0.95,
          });

          fastify.log.info({ page: sig.page, x: sig.x, y: pdfY }, 'Signature embedded');
        }

        // 5. Save và upload PDF đã ký
        const signedPdfBytes = await pdfDoc.save();
        const signedBuffer = Buffer.from(signedPdfBytes);

        const outputId = uuidv4();
        const signedKey = `contracts/signed/${outputId}/signed_contract.pdf`;
        const signedUrl = await uploadBuffer(signedBuffer, signedKey, 'application/pdf');

        fastify.log.info({ signedKey }, 'Signed PDF uploaded');
        return reply.status(200).send({
          signed_pdf_url: signedUrl,
          signed_pdf_minio_key: signedKey,
        });
      } catch (err: any) {
        fastify.log.error(err, 'Lỗi embed signature vào PDF');
        return reply.status(500).send({ error: err.message || 'Internal Server Error' });
      }
    }
  );
}
