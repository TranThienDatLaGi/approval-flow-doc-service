import PizZip from 'pizzip';

export interface ScannedPlaceholder {
  /** Tên placeholder, ví dụ: "ho_ten", "chu_ky_truong_phong" */
  key: string;
  /** Loại field: "text" hoặc "signature" */
  type: 'text' | 'signature';
  /** Label hiển thị cho user */
  label: string;
}

/** Một cột trong bảng lặp */
export interface ScannedColumn {
  /** Tên placeholder cột, ví dụ: "noi_dung", "thoi_gian" */
  key: string;
  /** Label hiển thị, ví dụ: "Nội Dung" */
  label: string;
}

/** Một bảng lặp phát hiện từ template */
export interface ScannedTable {
  /** Tên bảng (key trong {{#key}}...{{/key}}) */
  key: string;
  /** Label hiển thị cho bảng */
  label: string;
  /** Danh sách cột phát hiện bên trong loop */
  columns: ScannedColumn[];
}

/** Kết quả scan template DOCX */
export interface ScanResult {
  /** Các placeholder đơn (flat fields + signature) */
  placeholders: ScannedPlaceholder[];
  /** Các bảng lặp (repeating tables) */
  tables: ScannedTable[];
}

/**
 * Quét file .docx để tìm tất cả placeholder {{key}}, {{#table}}...{{/table}}.
 * Trả về danh sách unique placeholders + repeating tables.
 *
 * Convention:
 * - {{chu_ky_*}} → type = "signature"
 * - {{#key}}...{{/key}} → repeating table
 * - Còn lại → type = "text"
 */
export function scanDocxPlaceholders(docxBuffer: Buffer): ScanResult {
  const zip = new PizZip(docxBuffer);

  // Lấy nội dung XML chính
  const documentXml = zip.files['word/document.xml']?.asText();
  if (!documentXml) {
    throw new Error('Không tìm thấy word/document.xml trong file .docx');
  }

  // Regex tìm {{key}} — handle cả trường hợp text bị split qua nhiều XML tags
  // Bước 1: Strip XML tags để lấy plain text
  const plainText = documentXml.replace(/<[^>]+>/g, '');

  // ── Bước 2: Detect repeating tables {{#key}}...{{/key}} ──
  const tables: ScannedTable[] = [];
  const tableColumnKeys = new Set<string>(); // keys thuộc table, loại khỏi flat list
  const loopTagKeys = new Set<string>();     // {{#key}} và {{/key}} tags

  const loopRegex = /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let loopMatch: RegExpExecArray | null;

  while ((loopMatch = loopRegex.exec(plainText)) !== null) {
    const tableKey = loopMatch[1];
    const loopBody = loopMatch[2];

    // Tìm {{column}} trong body loop
    const colRegex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const columns: ScannedColumn[] = [];
    const seenCols = new Set<string>();
    let colMatch: RegExpExecArray | null;

    while ((colMatch = colRegex.exec(loopBody)) !== null) {
      const colKey = colMatch[1].trim();
      if (colKey && !seenCols.has(colKey)) {
        seenCols.add(colKey);
        columns.push({ key: colKey, label: humanizeKey(colKey) });
        tableColumnKeys.add(colKey);
      }
    }

    tables.push({
      key: tableKey,
      label: humanizeKey(tableKey),
      columns,
    });

    // Đánh dấu loop tags để loại khỏi flat list
    loopTagKeys.add(`#${tableKey}`);
    loopTagKeys.add(`/${tableKey}`);
  }

  // ── Bước 3: Tìm tất cả {{...}} cho flat fields ──
  const regex = /\{\{([^}]+)\}\}/g;
  const foundKeys = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(plainText)) !== null) {
    const key = match[1].trim();
    if (key) {
      foundKeys.add(key);
    }
  }

  // ── Bước 4: Map sang ScannedPlaceholder (loại bỏ loop tags + table columns) ──
  const placeholders: ScannedPlaceholder[] = [];
  for (const key of foundKeys) {
    // Bỏ qua loop markers: {{#xxx}}, {{/xxx}}
    if (key.startsWith('#') || key.startsWith('/')) continue;
    // Bỏ qua keys thuộc về columns trong table
    if (tableColumnKeys.has(key)) continue;

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

  return { placeholders, tables };
}

/**
 * Tạo bản sao "sạch" của DOCX — thay tất cả {{key}} bằng "_______________".
 * Xử lý cả loop tags: xóa {{#key}} và {{/key}}, giữ 1 dòng mẫu với ___.
 * Giữ nguyên format/style gốc, chỉ xoá placeholder text.
 * Trả về Buffer DOCX mới.
 */
export function stripPlaceholdersFromDocx(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);

  const documentXml = zip.files['word/document.xml']?.asText();
  if (!documentXml) {
    throw new Error('Không tìm thấy word/document.xml trong file .docx');
  }

  // Bước 1: Xử lý trường hợp placeholder nằm gọn trong 1 XML text node
  let cleanedXml = documentXml;

  // Xóa loop markers {{#key}} và {{/key}} (thay bằng chuỗi rỗng)
  cleanedXml = cleanedXml.replace(/\{\{[#/][^}]+\}\}/g, '');

  // Thay {{key}} → _______________
  cleanedXml = cleanedXml.replace(
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

  // Find remaining {{ }} in concatenated text (including loop markers)
  const placeholderRegex = /\{\{[#/]?[^}]+\}\}/g;
  let pm: RegExpExecArray | null;
  const segmentsToClean = new Set<number>();
  const firstSegments = new Map<number, string>(); // segIdx → replacement text

  while ((pm = placeholderRegex.exec(concatenated)) !== null) {
    const startMap = charMap[pm.index];
    const endMap = charMap[pm.index + pm[0].length - 1];
    if (!startMap || !endMap) continue;

    // Xác định replacement: loop markers → rỗng, còn lại → ___
    const isLoopMarker = pm[0].startsWith('{{#') || pm[0].startsWith('{{/');
    const replacement = isLoopMarker ? '' : '_______________';

    firstSegments.set(startMap.segIdx, replacement);
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
      ? `${seg.prefix}${firstSegments.get(idx)}${seg.suffix}`
      : `${seg.prefix}${seg.suffix}`;
    result = result.substring(0, seg.start) + replacement + result.substring(seg.end);
  }

  return result;
}

/**
 * Chuyển snake_case key thành label đẹp.
 * Ví dụ: "ho_ten" → "Ho Ten", "chu_ky_truong_phong" → "Chu Ky Truong Phong"
 */
function humanizeKey(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
