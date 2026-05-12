import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Convert DOCX buffer → PDF buffer via LibreOffice headless.
 * Giữ nguyên format Word: bảng, header, logo, font, căn lề.
 */
export async function convertDocxToPdfViaLibreOffice(docxBuffer: Buffer): Promise<Buffer> {
  const baseDir = path.join(os.tmpdir(), `lo-${uuidv4()}`);
  const workDir = path.join(baseDir, 'work');
  const homeDir = path.join(baseDir, 'home');
  
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(homeDir, { recursive: true });

  const inputPath = path.join(workDir, 'input.docx');
  const expectedOutputPath = path.join(workDir, 'input.pdf');

  try {
    // Write DOCX to temp file
    await fs.writeFile(inputPath, docxBuffer);
    console.log(`LibreOffice input: ${inputPath} (${docxBuffer.length} bytes)`);

    // Convert via LibreOffice headless
    // UserInstallation avoids profile lock issues in concurrent usage
    const userInstallation = `file://${path.join(homeDir, 'profile')}`;
    
    const loResult = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        'soffice',
        [
          '--headless',
          '--norestore',
          '--nofirststartwizard',
          `-env:UserInstallation=${userInstallation}`,
          '--convert-to', 'pdf',
          '--outdir', workDir,
          inputPath,
        ],
        {
          timeout: 60000,
          env: {
            ...process.env,
            HOME: homeDir,
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            console.error('LibreOffice error:', error.message);
            console.error('LibreOffice stderr:', stderr);
            console.error('LibreOffice stdout:', stdout);
            reject(new Error(`LibreOffice convert failed: ${error.message}\nstderr: ${stderr}`));
          } else {
            resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
          }
        }
      );
    });

    console.log('LibreOffice stdout:', loResult.stdout);
    if (loResult.stderr) {
      console.warn('LibreOffice stderr:', loResult.stderr);
    }

    // List work directory
    const files = await fs.readdir(workDir);
    console.log('Work directory contents:', files);

    // Check if PDF was created
    const pdfFile = files.find(f => f.endsWith('.pdf'));
    if (pdfFile) {
      const pdfPath = path.join(workDir, pdfFile);
      const pdfBuffer = await fs.readFile(pdfPath);
      console.log(`PDF generated: ${pdfFile} (${pdfBuffer.length} bytes)`);
      return pdfBuffer;
    }

    throw new Error(
      `LibreOffice did not produce PDF. Files: ${files.join(', ')}. stdout: ${loResult.stdout}. stderr: ${loResult.stderr}`
    );
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true }).catch(() => {});
  }
}
