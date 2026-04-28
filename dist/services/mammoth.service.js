"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertDocxToHtml = convertDocxToHtml;
exports.extractRawText = extractRawText;
const mammoth = __importStar(require("mammoth"));
/**
 * Convert .docx Buffer → clean HTML
 */
async function convertDocxToHtml(buffer) {
    const result = await mammoth.convertToHtml({ buffer }, {
        styleMap: [
            // Giữ heading styles
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            // Table styles
            "r[style-name='Strong'] => strong",
            "r[style-name='Emphasis'] => em",
            // Underline
            "u => u",
        ],
        convertImage: mammoth.images.imgElement((image) => {
            return image.read('base64').then((imageBuffer) => ({
                src: `data:${image.contentType};base64,${imageBuffer}`,
            }));
        }),
        includeDefaultStyleMap: true,
    });
    // Thêm basic styling cho table nếu có
    let html = result.value;
    html = wrapTableStyles(html);
    return {
        html,
        messages: result.messages,
    };
}
/**
 * Inject inline styles vào table để giữ layout
 */
function wrapTableStyles(html) {
    return html
        .replace(/<table>/g, '<table style="border-collapse:collapse;width:100%;margin:8px 0;">')
        .replace(/<td>/g, '<td style="border:1px solid #d1d5db;padding:6px 10px;vertical-align:top;">')
        .replace(/<th>/g, '<th style="border:1px solid #d1d5db;padding:6px 10px;background:#f3f4f6;font-weight:600;">');
}
/**
 * Extract raw text từ .docx để phân tích
 */
async function extractRawText(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}
//# sourceMappingURL=mammoth.service.js.map