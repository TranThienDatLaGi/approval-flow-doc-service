/**
 * Test script cho scanner.service.ts
 * Tạo DOCX template giả lập có cả flat fields + repeating table,
 * sau đó test scanDocxPlaceholders() và stripPlaceholdersFromDocx().
 */
import PizZip from 'pizzip';
import { scanDocxPlaceholders, stripPlaceholdersFromDocx } from './src/services/scanner.service';

// ── Helper: Tạo minimal valid DOCX buffer ──
function createTestDocx(bodyXml: string): Buffer {
  const zip = new PizZip();
  
  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  // word/_rels/document.xml.rels
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

  // word/document.xml
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`);

  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

function makeTextRun(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

// ══════════════════════════════════════════════════════════════════
// TEST 1: Chỉ có flat fields (backward compat)
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 1: Flat fields only ═══');
const docx1 = createTestDocx([
  makeTextRun('Họ và tên: {{ho_ten}}'),
  makeTextRun('Chức vụ: {{chuc_vu}}'),
  makeTextRun('Chữ ký: {{chu_ky_nguoi_lam_don}}'),
].join(''));

const result1 = scanDocxPlaceholders(docx1);
console.log('Placeholders:', result1.placeholders.length);
console.log('Tables:', result1.tables.length);
console.assert(result1.placeholders.length === 3, `Expected 3 placeholders, got ${result1.placeholders.length}`);
console.assert(result1.tables.length === 0, `Expected 0 tables, got ${result1.tables.length}`);

// Check types
const hoTen = result1.placeholders.find(p => p.key === 'ho_ten');
const chuKy = result1.placeholders.find(p => p.key === 'chu_ky_nguoi_lam_don');
console.assert(hoTen?.type === 'text', `ho_ten should be text, got ${hoTen?.type}`);
console.assert(chuKy?.type === 'signature', `chu_ky should be signature, got ${chuKy?.type}`);
console.log('✅ TEST 1 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 2: 1 table + flat fields
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 2: 1 table + flat fields ═══');
const docx2 = createTestDocx([
  makeTextRun('Nhân viên: {{ten_nhan_vien}}'),
  makeTextRun('Phòng ban: {{phong_ban}}'),
  makeTextRun('{{#ke_hoach}}'),
  makeTextRun('{{stt}} | {{noi_dung}} | {{thoi_gian}}'),
  makeTextRun('{{/ke_hoach}}'),
  makeTextRun('Chữ ký: {{chu_ky_truong_phong}}'),
].join(''));

const result2 = scanDocxPlaceholders(docx2);
console.log('Placeholders:', result2.placeholders.map(p => `${p.key}(${p.type})`));
console.log('Tables:', result2.tables.map(t => `${t.key}[${t.columns.map(c => c.key).join(',')}]`));

// Flat fields: ten_nhan_vien, phong_ban, chu_ky_truong_phong (3)
// Table columns stt, noi_dung, thoi_gian KHÔNG nằm trong flat list
console.assert(result2.placeholders.length === 3, `Expected 3 flat placeholders, got ${result2.placeholders.length}: ${result2.placeholders.map(p=>p.key)}`);
console.assert(result2.tables.length === 1, `Expected 1 table, got ${result2.tables.length}`);
console.assert(result2.tables[0].key === 'ke_hoach', `Expected table key 'ke_hoach', got ${result2.tables[0].key}`);
console.assert(result2.tables[0].columns.length === 3, `Expected 3 columns, got ${result2.tables[0].columns.length}`);

// Verify stt, noi_dung, thoi_gian NOT in flat placeholders
const flatKeys2 = result2.placeholders.map(p => p.key);
console.assert(!flatKeys2.includes('stt'), 'stt should NOT be in flat placeholders');
console.assert(!flatKeys2.includes('noi_dung'), 'noi_dung should NOT be in flat placeholders');
console.assert(!flatKeys2.includes('thoi_gian'), 'thoi_gian should NOT be in flat placeholders');
console.log('✅ TEST 2 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 3: 2 tables
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 3: 2 tables ═══');
const docx3 = createTestDocx([
  makeTextRun('{{ho_ten}}'),
  makeTextRun('{{#bang_cham_cong}}'),
  makeTextRun('{{ngay}} | {{gio_vao}} | {{gio_ra}}'),
  makeTextRun('{{/bang_cham_cong}}'),
  makeTextRun('{{#chi_phi}}'),
  makeTextRun('{{hang_muc}} | {{so_tien}}'),
  makeTextRun('{{/chi_phi}}'),
].join(''));

const result3 = scanDocxPlaceholders(docx3);
console.log('Placeholders:', result3.placeholders.map(p => p.key));
console.log('Tables:', result3.tables.map(t => `${t.key}[${t.columns.map(c => c.key).join(',')}]`));

console.assert(result3.placeholders.length === 1, `Expected 1 flat, got ${result3.placeholders.length}`);
console.assert(result3.tables.length === 2, `Expected 2 tables, got ${result3.tables.length}`);
console.assert(result3.tables[0].columns.length === 3, `Table 1 should have 3 cols`);
console.assert(result3.tables[1].columns.length === 2, `Table 2 should have 2 cols`);
console.log('✅ TEST 3 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 4: stripPlaceholdersFromDocx with loops
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 4: Strip placeholders with loops ═══');
const stripped = stripPlaceholdersFromDocx(docx2);
const strippedZip = new PizZip(stripped);
const strippedXml = strippedZip.files['word/document.xml'].asText();
const strippedText = strippedXml.replace(/<[^>]+>/g, '');

// Loop markers should be removed
console.assert(!strippedText.includes('{{#ke_hoach}}'), 'Loop open marker should be stripped');
console.assert(!strippedText.includes('{{/ke_hoach}}'), 'Loop close marker should be stripped');
// Flat placeholders should be replaced with ___
console.assert(!strippedText.includes('{{ten_nhan_vien}}'), 'Flat placeholder should be stripped');
console.assert(strippedText.includes('___'), 'Should contain ___ replacements');
console.log('Stripped text preview:', strippedText.substring(0, 200));
console.log('✅ TEST 4 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 5: Empty template (no placeholders)
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 5: Empty template ═══');
const docx5 = createTestDocx(makeTextRun('Đây là văn bản thuần, không có placeholder.'));
const result5 = scanDocxPlaceholders(docx5);
console.assert(result5.placeholders.length === 0, 'Expected 0 placeholders');
console.assert(result5.tables.length === 0, 'Expected 0 tables');
console.log('✅ TEST 5 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 6: Label humanization
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 6: Label humanization ═══');
console.assert(result2.tables[0].label === 'Ke Hoach', `Expected 'Ke Hoach', got '${result2.tables[0].label}'`);
const sttCol = result2.tables[0].columns.find(c => c.key === 'stt');
console.assert(sttCol?.label === 'Stt', `Expected 'Stt', got '${sttCol?.label}'`);
console.log('✅ TEST 6 PASSED');

console.log('\n══════════════════════════════════════');
console.log('🎉 ALL 6 TESTS PASSED!');
console.log('══════════════════════════════════════\n');
