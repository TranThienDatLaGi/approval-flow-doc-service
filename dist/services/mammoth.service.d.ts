export interface MammothMessage {
    type: 'warning' | 'error' | string;
    message: string;
    [key: string]: any;
}
export interface ConvertResult {
    html: string;
    messages: MammothMessage[];
}
/**
 * Convert .docx Buffer → clean HTML
 */
export declare function convertDocxToHtml(buffer: Buffer): Promise<ConvertResult>;
/**
 * Extract raw text từ .docx để phân tích
 */
export declare function extractRawText(buffer: Buffer): Promise<string>;
//# sourceMappingURL=mammoth.service.d.ts.map