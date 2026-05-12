import PizZip from 'pizzip';

export interface ScannedPlaceholder {
  /** Tên placeholder, ví dụ: "ho_ten", "chu_ky_truong_phong" */
  key: string;
  /** Loại field: "text" hoặc "signature" */
  type: 'text' | 'signature';
  /** Label hiển thị cho user */
  label: string;
}

/**
 * Quét file .docx để tìm tất cả placeholder {{key}}.
 * Trả về danh sách unique placeholders với metadata.
 *
 * Convention:
 * - {{chu_ky_*}} → type = "signature"
 * - Còn lại → type = "text"
 */
export function scanDocxPlaceholders(docxBuffer: Buffer): ScannedPlaceholder[] {
  const zip = new PizZip(docxBuffer);

  // Lấy nội dung XML chính
  const documentXml = zip.files['word/document.xml']?.asText();
  if (!documentXml) {
    throw new Error('Không tìm thấy word/document.xml trong file .docx');
  }

  // Regex tìm {{key}} — handle cả trường hợp text bị split qua nhiều XML tags
  // Bước 1: Strip XML tags để lấy plain text
  const plainText = documentXml.replace(/<[^>]+>/g, '');

  // Bước 2: Tìm tất cả {{...}}
  const regex = /\{\{([^}]+)\}\}/g;
  const foundKeys = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(plainText)) !== null) {
    const key = match[1].trim();
    if (key) {
      foundKeys.add(key);
    }
  }

  // Bước 3: Map sang ScannedPlaceholder
  const placeholders: ScannedPlaceholder[] = [];
  for (const key of foundKeys) {
    const isSignature = key.startsWith('chu_ky_');
    placeholders.push({
      key,
      type: isSignature ? 'signature' : 'text',
      label: humanizeKey(key),
    });
  }

  // Sắp xếp: text fields trước, signature sau
  placeholders.sort((a, b) => {
    if (a.type === b.type) return a.key.localeCompare(b.key);
    return a.type === 'text' ? -1 : 1;
  });

  return placeholders;
}

/**
 * Tạo bản sao "sạch" của DOCX — thay tất cả {{key}} bằng "_______________".
 * Giữ nguyên format/style gốc, chỉ xoá placeholder text.
 * Trả về Buffer DOCX mới.
 */
export function stripPlaceholdersFromDocx(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);

  const documentXml = zip.files['word/document.xml']?.asText();
  if (!documentXml) {
    throw new Error('Không tìm thấy word/document.xml trong file .docx');
  }

  // Thay {{key}} → _______________  trong XML (giữ nguyên tags xung quanh)
  // Bước 1: Xử lý trường hợp placeholder nằm gọn trong 1 XML text node
  let cleanedXml = documentXml.replace(
    /\{\{([^}]+)\}\}/g,
    '_______________'
  );

  // Bước 2: Xử lý trường hợp {{ và }} bị Word split qua nhiều <w:t> tags
  // Pattern: tìm {{ (có thể xen XML tags) ... }} rồi thay text nodes bên trong
  // Dùng stateful approach: scan qua từng <w:t> content
  cleanedXml = cleanMergedPlaceholders(cleanedXml);

  zip.file('word/document.xml', cleanedXml);
  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

/**
 * Xử lý trường hợp {{ và }} bị tách qua nhiều <w:t> nodes.
 * Ví dụ: <w:t>{{</w:t></w:r><w:r><w:t>ten</w:t></w:r><w:r><w:t>}}</w:t>
 * → thay toàn bộ thành <w:t>_______________</w:t> ở node đầu, xoá text ở các node sau.
 */
function cleanMergedPlaceholders(xml: string): string {
  // Tìm tất cả nội dung giữa <w:t...>...</w:t> tags
  const textRegex = /(<w:t[^>]*>)(.*?)(<\/w:t>)/g;
  const segments: { start: number; end: number; text: string; fullMatch: string; prefix: string; suffix: string }[] = [];

  let m: RegExpExecArray | null;
  while ((m = textRegex.exec(xml)) !== null) {
    segments.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[2],
      fullMatch: m[0],
      prefix: m[1],
      suffix: m[3],
    });
  }

  // Concatenate all text to find any remaining {{...}} patterns
  const concatenated = segments.map(s => s.text).join('');
  if (!concatenated.includes('{{')) return xml;

  // Map character positions in concatenated string back to segment indices
  let charPos = 0;
  const charMap: { segIdx: number; charInSeg: number }[] = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = 0; j < segments[i].text.length; j++) {
      charMap.push({ segIdx: i, charInSeg: j });
      charPos++;
    }
  }

  // Find remaining {{ }} in concatenated text
  const placeholderRegex = /\{\{[^}]+\}\}/g;
  let pm: RegExpExecArray | null;
  const segmentsToClean = new Set<number>();
  const firstSegments = new Map<number, boolean>();

  while ((pm = placeholderRegex.exec(concatenated)) !== null) {
    const startMap = charMap[pm.index];
    const endMap = charMap[pm.index + pm[0].length - 1];
    if (!startMap || !endMap) continue;

    firstSegments.set(startMap.segIdx, true);
    for (let si = startMap.segIdx; si <= endMap.segIdx; si++) {
      segmentsToClean.add(si);
    }
  }

  if (segmentsToClean.size === 0) return xml;

  // Replace in reverse order to preserve positions
  let result = xml;
  const sortedIndices = Array.from(segmentsToClean).sort((a, b) => b - a);

  for (const idx of sortedIndices) {
    const seg = segments[idx];
    const replacement = firstSegments.has(idx)
      ? `${seg.prefix}_______________${seg.suffix}`
      : `${seg.prefix}${seg.suffix}`;
    result = result.substring(0, seg.start) + replacement + result.substring(seg.end);
  }

  return result;
}

/**
 * Chuyển snake_case key thành label đẹp.
 * Ví dụ: "ho_ten" → "Họ Tên", "chu_ky_truong_phong" → "Chữ Ký Trưởng Phòng"
 */
function humanizeKey(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
