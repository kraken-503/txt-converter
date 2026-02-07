// pages/api/convert.js

import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import Papa from 'papaparse';

export const config = { api: { bodyParser: false } };

// parseForm: dynamic import of formidable to avoid ESM/CJS interop issues
const parseForm = async (req) => {
  const formidableModule = await import('formidable');
  const formidable = formidableModule.default ?? formidableModule;

  return new Promise((resolve, reject) => {
    try {
      const form = formidable({ multiples: false, keepExtensions: true });
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    } catch (err) {
      reject(err);
    }
  });
};

// textToPdf: embeds a Unicode TTF font (place a TTF in public/fonts) and wraps text
async function textToPdf(text) {
  const pdfDoc = await PDFDocument.create();

  // Register fontkit so pdf-lib can embed custom fonts
  const fontkitModule = await import('@pdf-lib/fontkit');
  const fontkit = fontkitModule.default ?? fontkitModule;
  pdfDoc.registerFontkit(fontkit);

  // Load a Unicode TTF font from the repo. Place a font at public/fonts/NotoSans-Regular.ttf
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf');
  if (!fs.existsSync(fontPath)) {
    throw new Error('Missing font file at public/fonts/NotoSans-Regular.ttf. Add a Unicode TTF font.');
  }
  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes);

  const fontSize = 12;
  const margin = 40;
  const lineHeight = fontSize * 1.4;

  // helper to wrap a single line into multiple lines that fit the page width
  function wrapLine(line, maxWidth) {
    if (!line) return [' '];
    const words = line.split(' ');
    const lines = [];
    let current = '';

    for (const w of words) {
      const test = current ? current + ' ' + w : w;
      const width = font.widthOfTextAtSize(test, fontSize);
      if (width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        // if single word is too long, break by characters
        if (font.widthOfTextAtSize(w, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of w) {
            const t = chunk + ch;
            if (font.widthOfTextAtSize(t, fontSize) <= maxWidth) chunk = t;
            else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          if (chunk) current = chunk;
          else current = '';
        } else {
          current = w;
        }
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // create first page
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();
  const maxTextWidth = width - margin * 2;
  let y = height - margin;

  const rawLines = text.split('\n');

  for (const raw of rawLines) {
    const wrapped = wrapLine(raw || ' ', maxTextWidth);
    for (const line of wrapped) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage();
        ({ width, height } = page.getSize());
        y = height - margin;
      }
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font
      });
      y -= lineHeight;
    }
  }

  return await pdfDoc.save();
}

// textToDocx: dynamic import of docx and build a document with sections
async function textToDocx(text) {
  const docxModule = await import('docx');
  const { Document, Packer, Paragraph, TextRun } = docxModule;

  const paragraphs = text
    .split('\n')
    .map((ln) => new Paragraph({ children: [new TextRun(ln || ' ')] }));

  const doc = new Document({
    creator: 'File Converter',
    title: 'Converted Document',
    description: 'Generated from plain text',
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// textToCsv: single-column CSV from lines
function textToCsv(text) {
  const rows = text.split('\n').map((r) => [r]);
  return Papa.unparse(rows);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { fields = {}, files = {} } = await parseForm(req);

    // Debug logs (remove in production)
    console.log('fields:', fields);
    console.log('files keys:', files ? Object.keys(files) : []);

    // Normalize format safely (handles arrays and non-strings)
    const rawFormat = Array.isArray(fields.format) ? fields.format[0] : fields.format;
    const format = (rawFormat ?? 'pdf').toString().trim().toLowerCase();

    // Obtain text either from uploaded file or pasted field
    let text = '';
    if (files && files.file) {
      const fileObj = Array.isArray(files.file) ? files.file[0] : files.file;
      const buf = fs.readFileSync(fileObj.filepath);
      text = buf.toString('utf8');
    } else if (fields && fields.paste) {
      text = Array.isArray(fields.paste) ? fields.paste.join('\n') : fields.paste;
    } else {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (format === 'pdf') {
      const pdfBytes = await textToPdf(text);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="converted.pdf"');
      return res.send(Buffer.from(pdfBytes));
    }

    if (format === 'docx') {
      const docxBuf = await textToDocx(text);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="converted.docx"');
      return res.send(docxBuf);
    }

    if (format === 'csv') {
      const csv = textToCsv(text);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="converted.csv"');
      return res.send(csv);
    }

    return res.status(400).json({ error: 'Unsupported format' });
  } catch (err) {
    console.error('Conversion error:', err);
    return res.status(500).json({ error: 'Conversion failed', message: err.message });
  }
}

