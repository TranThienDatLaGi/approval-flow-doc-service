import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export interface GenerateDocxOptions {
  /** Buffer của file .docx gốc (template) */
  templateBuffer: Buffer;
  /** Map field key → giá trị thật */
  fieldValues: Record<string, string>;
}

/**
 * Điền data vào .docx template và trả về .docx Buffer
 * Template dùng cú pháp {{key}} bên trong .docx XML
 */
export function generateDocxFromTemplate(options: GenerateDocxOptions): Buffer {
  const { templateBuffer, fieldValues } = options;

  const zip = new PizZip(templateBuffer);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    errorLogging: false,
  });

  // Render với data
  doc.render(fieldValues);

  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  return buf;
}

/**
 * Chuẩn bị .docx template: inject {{key}} vào đúng vị trí
 * dựa trên field_map và HTML template có chứa field tags
 *
 * Flow:
 * 1. Parse HTML để tìm các field tags (data-field-key)
 * 2. Inject {{key}} tương ứng vào vị trí trong .docx XML
 *
 * NOTE: Approach đơn giản hơn - dùng text replacement trong .docx XML
 */
export function injectPlaceholdersIntoDocx(
  docxBuffer: Buffer,
  fieldMap: Array<{ key: string; originalText: string }>
): Buffer {
  const zip = new PizZip(docxBuffer);

  // Lấy nội dung XML của document
  let documentXml = zip.files['word/document.xml'].asText();

  for (const field of fieldMap) {
    if (!field.originalText) continue;

    // Escape XML special chars
    const escapedText = escapeXml(field.originalText);
    const placeholder = `{{${field.key}}}`;

    // Replace toàn bộ occurrence trong XML
    // Cần handle case text bị split qua nhiều <w:r> elements
    documentXml = documentXml.split(escapedText).join(placeholder);
  }

  zip.file('word/document.xml', documentXml);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
