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
export declare function generateDocxFromTemplate(options: GenerateDocxOptions): Buffer;
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
export declare function injectPlaceholdersIntoDocx(docxBuffer: Buffer, fieldMap: Array<{
    key: string;
    originalText: string;
}>): Buffer;
//# sourceMappingURL=docxtemplater.service.d.ts.map