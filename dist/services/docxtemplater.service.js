"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDocxFromTemplate = generateDocxFromTemplate;
exports.injectPlaceholdersIntoDocx = injectPlaceholdersIntoDocx;
const pizzip_1 = __importDefault(require("pizzip"));
const docxtemplater_1 = __importDefault(require("docxtemplater"));
/**
 * Điền data vào .docx template và trả về .docx Buffer
 * Template dùng cú pháp {{key}} bên trong .docx XML
 */
function generateDocxFromTemplate(options) {
    const { templateBuffer, fieldValues } = options;
    const zip = new pizzip_1.default(templateBuffer);
    const doc = new docxtemplater_1.default(zip, {
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
function injectPlaceholdersIntoDocx(docxBuffer, fieldMap) {
    const zip = new pizzip_1.default(docxBuffer);
    // Lấy nội dung XML của document
    let documentXml = zip.files['word/document.xml'].asText();
    for (const field of fieldMap) {
        if (!field.originalText)
            continue;
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
function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
//# sourceMappingURL=docxtemplater.service.js.map