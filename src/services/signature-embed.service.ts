import PizZip from 'pizzip';
import { downloadBuffer } from './minio.service';

/**
 * Embed signature images vào DOCX tại vị trí {{placeholder_key}}.
 * 
 * @param docxBuffer - DOCX buffer (đã fill text fields)
 * @param signatures - Map: { placeholder_key: minio_image_path }
 *   Ví dụ: { "chu_ky_nguoi_lam_don": "/file-upload/signatures/abc.png" }
 * @returns DOCX buffer với ảnh chữ ký đã embed
 */
export async function embedSignaturesInDocx(
  docxBuffer: Buffer,
  signatures: Record<string, string>
): Promise<Buffer> {
  const entries = Object.entries(signatures).filter(([_, url]) => url && url.trim() !== '');
  if (entries.length === 0) return docxBuffer;

  const zip = new PizZip(docxBuffer);

  // Read document.xml
  const docXmlFile = zip.files['word/document.xml'];
  if (!docXmlFile) return docxBuffer;
  let docXml = docXmlFile.asText();

  // Read existing rels
  const relsFile = zip.files['word/_rels/document.xml.rels'];
  let relsXml = relsFile ? relsFile.asText() : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  // Find max existing rId
  let maxRId = 0;
  const rIdMatches = relsXml.matchAll(/Id="rId(\d+)"/g);
  for (const m of rIdMatches) {
    const num = parseInt(m[1], 10);
    if (num > maxRId) maxRId = num;
  }

  let imageIndex = 0;

  for (const [placeholderKey, imageUrl] of entries) {
    try {
      // Download signature image from MinIO
      const imgBuffer = await downloadBuffer(imageUrl);

      // Determine image type
      const ext = imageUrl.toLowerCase().includes('.png') ? 'png' : 'jpeg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

      imageIndex++;
      const rId = `rId${maxRId + imageIndex}`;
      const mediaFileName = `signature_${imageIndex}.${ext}`;

      // 1. Add image to word/media/
      zip.file(`word/media/${mediaFileName}`, imgBuffer);

      // 2. Add relationship
      const relEntry = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaFileName}"/>`;
      relsXml = relsXml.replace('</Relationships>', `${relEntry}</Relationships>`);

      // 3. Add Content Type if not exists
      const contentTypesFile = zip.files['[Content_Types].xml'];
      if (contentTypesFile) {
        let ctXml = contentTypesFile.asText();
        if (!ctXml.includes(`Extension="${ext}"`)) {
          ctXml = ctXml.replace('</Types>', `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`);
          zip.file('[Content_Types].xml', ctXml);
        }
      }

      // 4. Replace {{placeholder_key}} in document.xml with inline image drawing
      // Image size: ~150x75 pt ≈ 1905000 x 952500 EMU (1pt = 12700 EMU)
      const imgWidth = 1905000; // ~150pt = ~5.3cm
      const imgHeight = 952500; // ~75pt = ~2.6cm

      const drawingXml = buildInlineImageXml(rId, imageIndex, imgWidth, imgHeight, placeholderKey);

      // Replace the placeholder text with the drawing
      // The placeholder might be in a <w:t> element like: <w:t>{{chu_ky_xxx}}</w:t>
      // We need to replace the entire <w:r> containing it with a new <w:r> containing the drawing
      const placeholderEscaped = `{{${placeholderKey}}}`;
      
      // Simple approach: find {{key}} in XML text nodes and replace with drawing XML
      // The drawing must be inside <w:r> but OUTSIDE <w:t>
      const tRegex = new RegExp(
        `<w:r([^>]*)>([\\s\\S]*?)<w:t[^>]*>[^<]*\\{\\{${escapeRegex(placeholderKey)}\\}\\}[^<]*</w:t>([\\s\\S]*?)</w:r>`,
        'g'
      );

      if (tRegex.test(docXml)) {
        docXml = docXml.replace(tRegex, `<w:r$1>$2${drawingXml}$3</w:r>`);
      } else {
        // Fallback: simple text replacement (less precise)
        docXml = docXml.split(placeholderEscaped).join('');
        console.warn(`Could not find run containing {{${placeholderKey}}}, image may not be placed correctly`);
      }

    } catch (err: any) {
      console.error(`Failed to embed signature for ${placeholderKey}:`, err.message);
      // Continue with other signatures
    }
  }

  // Write back modified files
  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', relsXml);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Build OOXML inline image element
 */
function buildInlineImageXml(
  rId: string,
  imageId: number,
  cx: number,
  cy: number,
  name: string
): string {
  return `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${imageId}" name="${name}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="${imageId}" name="${name}.png"/>` +
    `<pic:cNvPicPr/>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>`;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
