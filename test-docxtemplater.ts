/**
 * Test script cho docxtemplater.service.ts
 * Test loop rendering: {{#table}}...{{/table}} → nhân bản rows
 */
import PizZip from 'pizzip';
import { generateDocxFromTemplate } from './src/services/docxtemplater.service';

// ── Helper: Tạo minimal valid DOCX buffer ──
function createTestDocx(bodyXml: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`);
  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

function makeTextRun(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

// ══════════════════════════════════════════════════════════════════
// TEST 1: Flat field replacement
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 1: Flat field replacement ═══');
const docx1 = createTestDocx([
  makeTextRun('Họ và tên: {{ho_ten}}'),
  makeTextRun('Phòng ban: {{phong_ban}}'),
].join(''));

const filled1 = generateDocxFromTemplate({
  templateBuffer: docx1,
  fieldValues: { ho_ten: 'Nguyễn Văn A', phong_ban: 'Kỹ thuật' },
});

const zip1 = new PizZip(filled1);
const text1 = zip1.files['word/document.xml'].asText().replace(/<[^>]+>/g, '');
console.log('Output:', text1.trim());
console.assert(text1.includes('Nguyễn Văn A'), 'Should contain filled name');
console.assert(text1.includes('Kỹ thuật'), 'Should contain filled dept');
console.assert(!text1.includes('{{ho_ten}}'), 'Should NOT contain placeholder');
console.log('✅ TEST 1 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 2: Loop rendering (repeating table)
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 2: Loop rendering ═══');
const docx2 = createTestDocx([
  makeTextRun('Nhân viên: {{ten_nhan_vien}}'),
  makeTextRun('{{#ke_hoach}}'),
  makeTextRun('{{stt}} - {{noi_dung}} - {{thoi_gian}}'),
  makeTextRun('{{/ke_hoach}}'),
  makeTextRun('Kết thúc'),
].join(''));

const filled2 = generateDocxFromTemplate({
  templateBuffer: docx2,
  fieldValues: {
    ten_nhan_vien: 'Trần Văn B',
    ke_hoach: [
      { stt: '1', noi_dung: 'Họp team', thoi_gian: '08:00' },
      { stt: '2', noi_dung: 'Review code', thoi_gian: '14:00' },
      { stt: '3', noi_dung: 'Deploy', thoi_gian: '17:00' },
    ],
  },
});

const zip2 = new PizZip(filled2);
const text2 = zip2.files['word/document.xml'].asText().replace(/<[^>]+>/g, '');
console.log('Output:', text2.trim());

console.assert(text2.includes('Trần Văn B'), 'Should contain filled name');
console.assert(text2.includes('Họp team'), 'Should contain row 1');
console.assert(text2.includes('Review code'), 'Should contain row 2');
console.assert(text2.includes('Deploy'), 'Should contain row 3');
console.assert(!text2.includes('{{#ke_hoach}}'), 'Loop markers should be removed');
console.assert(!text2.includes('{{/ke_hoach}}'), 'Loop markers should be removed');
console.assert(!text2.includes('{{stt}}'), 'Column placeholders should be filled');
console.log('✅ TEST 2 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 3: Empty array (no rows)
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 3: Empty array ═══');
const filled3 = generateDocxFromTemplate({
  templateBuffer: docx2,
  fieldValues: {
    ten_nhan_vien: 'Lê C',
    ke_hoach: [],
  },
});

const zip3 = new PizZip(filled3);
const text3 = zip3.files['word/document.xml'].asText().replace(/<[^>]+>/g, '');
console.log('Output:', text3.trim());

console.assert(text3.includes('Lê C'), 'Should contain filled name');
console.assert(!text3.includes('{{stt}}'), 'Empty array = no rows = no placeholders');
console.assert(text3.includes('Kết thúc'), 'Content after loop should remain');
console.log('✅ TEST 3 PASSED');

// ══════════════════════════════════════════════════════════════════
// TEST 4: Mixed — flat + multiple tables
// ══════════════════════════════════════════════════════════════════
console.log('\n═══ TEST 4: Multiple tables ═══');
const docx4 = createTestDocx([
  makeTextRun('{{ho_ten}}'),
  makeTextRun('{{#bang_a}}'),
  makeTextRun('A: {{col_a}}'),
  makeTextRun('{{/bang_a}}'),
  makeTextRun('{{#bang_b}}'),
  makeTextRun('B: {{col_b}}'),
  makeTextRun('{{/bang_b}}'),
].join(''));

const filled4 = generateDocxFromTemplate({
  templateBuffer: docx4,
  fieldValues: {
    ho_ten: 'Test User',
    bang_a: [{ col_a: 'A1' }, { col_a: 'A2' }],
    bang_b: [{ col_b: 'B1' }, { col_b: 'B2' }, { col_b: 'B3' }],
  },
});

const zip4 = new PizZip(filled4);
const text4 = zip4.files['word/document.xml'].asText().replace(/<[^>]+>/g, '');
console.log('Output:', text4.trim());

console.assert(text4.includes('A1'), 'Table A row 1');
console.assert(text4.includes('A2'), 'Table A row 2');
console.assert(text4.includes('B1'), 'Table B row 1');
console.assert(text4.includes('B3'), 'Table B row 3');
console.log('✅ TEST 4 PASSED');

console.log('\n══════════════════════════════════════');
console.log('🎉 ALL 4 DOCX TEMPLATE TESTS PASSED!');
console.log('══════════════════════════════════════\n');
