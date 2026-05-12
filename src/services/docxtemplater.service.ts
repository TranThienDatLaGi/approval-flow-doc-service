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
 *
 * Strategy: Try docxtemplater first → fallback safe XML replacement
 */
export function generateDocxFromTemplate(options: GenerateDocxOptions): Buffer {
  const { templateBuffer, fieldValues } = options;

  // Approach 1: Try docxtemplater (fast path)
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
      nullGetter() {
        return '';
      },
    });
    doc.render(fieldValues);
    return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (err: any) {
    console.warn('Docxtemplater failed, falling back to safe XML replacement:', err.message);
  }

  // Approach 2: Safe XML replacement (không phá vỡ cấu trúc DOCX)
  return safeXmlReplace(templateBuffer, fieldValues);
}

/**
 * Safe DOCX fill: chỉ thay text trong <w:t> nodes, KHÔNG rebuild paragraphs.
 * Bước 1: Merge các {{key}} bị Word tách qua nhiều <w:t> elements
 * Bước 2: Replace {{key}} → value trong XML
 */
function safeXmlReplace(templateBuffer: Buffer, fieldValues: Record<string, string>): Buffer {
  const zip = new PizZip(templateBuffer);
  const xmlFile = zip.files['word/document.xml'];
  if (!xmlFile) {
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  let xml = xmlFile.asText();

  // Step 1: Merge split placeholders - gom {{ và }} bị tách qua XML tags
  xml = mergeSplitBraces(xml);

  // Step 2: Replace {{key}} → escaped value
  for (const [key, value] of Object.entries(fieldValues)) {
    const placeholder = `{{${key}}}`;
    if (xml.includes(placeholder)) {
      xml = xml.split(placeholder).join(escapeXml(value));
    }
  }

  // Step 3: Clean remaining unreplaced {{...}} placeholders
  xml = xml.replace(/\{\{[^}]*\}\}/g, '');

  zip.file('word/document.xml', xml);

  // Also process headers/footers
  for (const filename of Object.keys(zip.files)) {
    if (/^word\/(header|footer)\d+\.xml$/.test(filename)) {
      let headerXml = zip.files[filename].asText();
      headerXml = mergeSplitBraces(headerXml);
      for (const [key, value] of Object.entries(fieldValues)) {
        headerXml = headerXml.split(`{{${key}}}`).join(escapeXml(value));
      }
      headerXml = headerXml.replace(/\{\{[^}]*\}\}/g, '');
      zip.file(filename, headerXml);
    }
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Merge {{ và }} bị Word tách qua nhiều XML runs.
 *
 * Word thường tách "{{key}}" thành:
 *   <w:t>{</w:t></w:r><w:r>...<w:t>{key</w:t></w:r><w:r>...<w:t>}}</w:t>
 *
 * Function này gom lại thành {{key}} liền trong 1 <w:t>.
 */
function mergeSplitBraces(xml: string): string {
  let result = xml;
  let changed = true;
  let maxIterations = 10;

  while (changed && maxIterations-- > 0) {
    changed = false;

    // Merge: }<XML_TAGS>} → }}
    const doubleClose = result.replace(
      /\}(<\/w:t>(?:<[^>]+>)*<w:t[^>]*>)\}/g,
      (match, xmlBetween) => { changed = true; return '}}'; }
    );
    if (changed) { result = doubleClose; changed = false; }

    // Merge: {<XML_TAGS>{ → {{
    const doubleOpen = result.replace(
      /\{(<\/w:t>(?:<[^>]+>)*<w:t[^>]*>)\{/g,
      (match, xmlBetween) => { changed = true; return '{{'; }
    );
    if (changed) { result = doubleOpen; changed = false; }

    // Merge: content split between {{ and }}
    // Pattern: {{text1</w:t>...<w:t>text2}} → {{text1text2}}
    const splitContent = result.replace(
      /(\{\{[^}<]*)(<\/w:t>(?:<[^>]+>)*<w:t[^>]*>)([^}]*\}\})/g,
      (match, before, xmlBetween, after) => { changed = true; return before + after; }
    );
    if (changed) { result = splitContent; }
  }

  return result;
}

/**
 * Chuẩn bị .docx template: inject {{key}} vào đúng vị trí
 */
export function injectPlaceholdersIntoDocx(
  docxBuffer: Buffer,
  fieldMap: Array<{ key: string; originalText: string }>
): Buffer {
  const zip = new PizZip(docxBuffer);
  let documentXml = zip.files['word/document.xml'].asText();

  for (const field of fieldMap) {
    if (!field.originalText) continue;
    const escapedText = escapeXml(field.originalText);
    const placeholder = `{{${field.key}}}`;
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
