import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import JSZip from 'jszip';

export function cleanExtractedText(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => { const point = Number(code); return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' '; })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function extractDocumentText(buffer, filename, mimeType = '') {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  const mime = String(mimeType || '').toLowerCase();
  if (ext === 'pdf' || mime.includes('application/pdf')) {
    // pdf-parse bundles an old pdf.js that ignores a Buffer's byteOffset. Small Buffers (< 4 KB, e.g. from an
    // upload) are slices of Node's shared memory pool, so parsing them directly fails or reads neighbouring bytes.
    // A Uint8Array copy owns its memory and parses correctly.
    const parsed = await pdfParse(new Uint8Array(buffer));
    return cleanExtractedText(parsed.text || '');
  }
  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    const parsed = await mammoth.extractRawText({ buffer });
    return cleanExtractedText(parsed.value || '');
  }
  if (ext === 'pptx' || mime.includes('presentationml')) {
    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));
    const slides = [];
    for (const name of slideNames) {
      const xml = await zip.files[name].async('string');
      const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(match => match[1]).join(' ');
      if (text.trim()) slides.push(text);
    }
    return cleanExtractedText(slides.join('\n\n'));
  }
  if (['txt', 'md', 'csv', 'html', 'htm', 'xml'].includes(ext) || mime.startsWith('text/')) {
    return cleanExtractedText(buffer.toString('utf8'));
  }
  return '';
}
