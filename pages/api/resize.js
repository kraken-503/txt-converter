import formidable from 'formidable';
import fs from 'fs';
import sharp from 'sharp';

export const config = { api: { bodyParser: false } };

const parseForm = (req) =>
  new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm();
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { fields, files } = await parseForm(req);
    const targetKb = Math.max(20, Math.min(100, parseInt(fields.targetKb || '100', 10)));
    const file = files.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const inputBuffer = fs.readFileSync(file.filepath);
    let quality = 80;
    let outputBuffer = await sharp(inputBuffer).jpeg({ quality }).toBuffer();

    // Iteratively reduce quality until under target size or quality floor
    const targetBytes = targetKb * 1024;
    while (outputBuffer.length > targetBytes && quality > 20) {
      quality -= 10;
      outputBuffer = await sharp(inputBuffer).jpeg({ quality }).toBuffer();
    }

    // If still too large, resize dimensions down
    if (outputBuffer.length > targetBytes) {
      let metadata = await sharp(inputBuffer).metadata();
      let width = Math.round((metadata.width || 1000) * 0.9);
      while (outputBuffer.length > targetBytes && width > 100) {
        outputBuffer = await sharp(inputBuffer).resize({ width }).jpeg({ quality }).toBuffer();
        width = Math.round(width * 0.9);
      }
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="resized.jpg"');
    res.send(outputBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Processing failed' });
  }
}

