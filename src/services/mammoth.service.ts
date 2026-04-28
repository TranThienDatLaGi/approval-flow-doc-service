import * as mammoth from 'mammoth';

export interface MammothMessage {
  type: 'warning' | 'error' | string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ConvertResult {
  html: string;
  messages: MammothMessage[];
}

/**
 * Convert .docx Buffer → clean HTML
 */
export async function convertDocxToHtml(buffer: Buffer): Promise<ConvertResult> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
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
    }
  );

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
function wrapTableStyles(html: string): string {
  return html
    .replace(
      /<table>/g,
      '<table style="border-collapse:collapse;width:100%;margin:8px 0;">'
    )
    .replace(
      /<td>/g,
      '<td style="border:1px solid #d1d5db;padding:6px 10px;vertical-align:top;">'
    )
    .replace(
      /<th>/g,
      '<th style="border:1px solid #d1d5db;padding:6px 10px;background:#f3f4f6;font-weight:600;">'
    );
}

/**
 * Extract raw text từ .docx để phân tích
 */
export async function extractRawText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
