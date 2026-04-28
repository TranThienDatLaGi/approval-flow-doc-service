import puppeteer, { Browser } from 'puppeteer';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
      executablePath: process.env.PUPPETEER_EXEC_PATH || undefined,
    });
  }
  return browserInstance;
}

/**
 * Render HTML + field data → PDF Buffer
 */
export async function renderHtmlToPdf(
  htmlContent: string,
  fieldValues: Record<string, string> = {}
): Promise<Buffer> {
  // Thay thế field tags trong HTML với data thật
  const filledHtml = injectFieldValues(htmlContent, fieldValues);

  const fullHtml = wrapInHtmlDocument(filledHtml);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '25mm',
        right: '20mm',
        bottom: '25mm',
        left: '25mm',
      },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

/**
 * Thay thế field tags dạng {{key}} hoặc data-field-key với giá trị thật
 */
function injectFieldValues(
  html: string,
  fieldValues: Record<string, string>
): string {
  let result = html;

  for (const [key, value] of Object.entries(fieldValues)) {
    // Thay thế span field-tag dạng: <span data-field-key="employee_name" ...>...</span>
    const fieldTagRegex = new RegExp(
      `<span[^>]*data-field-key="${key}"[^>]*>.*?</span>`,
      'gi'
    );
    result = result.replace(
      fieldTagRegex,
      `<span style="color:inherit;font-weight:inherit;">${value}</span>`
    );

    // Fallback: thay thế {{key}} nếu có
    const placeholderRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholderRegex, value);
  }

  return result;
}

/**
 * Bọc HTML fragment vào full HTML document với CSS
 */
function wrapInHtmlDocument(htmlFragment: string): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 13pt;
      line-height: 1.6;
      color: #000;
      margin: 0;
      padding: 0;
    }
    
    h1 { font-size: 16pt; text-align: center; font-weight: bold; }
    h2 { font-size: 14pt; font-weight: bold; }
    h3 { font-size: 13pt; font-weight: bold; }
    
    p { margin: 6pt 0; text-align: justify; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8pt 0;
    }
    
    td, th {
      border: 1px solid #000;
      padding: 4pt 8pt;
      vertical-align: top;
    }
    
    .field-tag {
      color: inherit;
      background: transparent;
    }
  </style>
</head>
<body>
  ${htmlFragment}
</body>
</html>`;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
