import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type DocumentAnnotationInput = {
  note?: string;
  providerName: string;
  signedAt: string;
  signaturePngDataUrl?: string | null;
};

function parsePngDataUrl(dataUrl: string): Uint8Array | null {
  const trimmed = dataUrl.replace(/\s/g, "");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(trimmed)) return null;
  const base64 = trimmed.slice("data:image/png;base64,".length);
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function buildTextFooter(input: DocumentAnnotationInput): string {
  const parts: string[] = ["", "---", `Provider annotation · ${input.signedAt}`];
  if (input.note?.trim()) {
    parts.push("", input.note.trim());
  }
  if (input.signaturePngDataUrl) {
    parts.push("", `Electronically signed by ${input.providerName} · ${input.signedAt}`);
  } else if (!input.note?.trim()) {
    parts.push("", `Signed by ${input.providerName} · ${input.signedAt}`);
  }
  return parts.join("\n");
}

function buildHtmlFooter(input: DocumentAnnotationInput): string {
  const noteBlock = input.note?.trim()
    ? `<div class="provider-annotation-note">${escapeHtml(input.note.trim()).replace(/\n/g, "<br />")}</div>`
    : "";
  const sigBlock =
    input.signaturePngDataUrl && parsePngDataUrl(input.signaturePngDataUrl)
      ? `<img src="${input.signaturePngDataUrl.replace(/"/g, "&quot;")}" alt="Signature" style="max-width:280px;max-height:90px;display:block;margin-top:12px;" />
         <div style="margin-top:6px;font-size:13px;">${escapeHtml(input.providerName)} · ${escapeHtml(input.signedAt)}</div>`
      : `<div style="margin-top:12px;font-size:13px;">Signed by ${escapeHtml(input.providerName)} · ${escapeHtml(input.signedAt)}</div>`;

  return `
<section class="provider-document-annotation" style="margin-top:36px;padding-top:16px;border-top:2px solid #0e7490;page-break-inside:avoid;">
  <h3 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:#0e7490;">Provider annotation</h3>
  ${noteBlock}
  ${sigBlock}
</section>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function appendPdfAnnotationPage(
  pdfBytes: Buffer,
  input: DocumentAnnotationInput
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([612, 792]);
  const margin = 50;
  let y = 742;

  page.drawText("Provider annotation", { x: margin, y, size: 12, font: bold, color: rgb(0.05, 0.45, 0.55) });
  y -= 28;

  if (input.note?.trim()) {
    for (const line of wrapText(input.note.trim(), 90)) {
      if (y < 120) break;
      page.drawText(line, { x: margin, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 14;
    }
    y -= 8;
  }

  const pngBytes = input.signaturePngDataUrl ? parsePngDataUrl(input.signaturePngDataUrl) : null;
  if (pngBytes) {
    const png = await pdfDoc.embedPng(pngBytes);
    const dims = png.scale(0.5);
    const width = Math.min(220, dims.width);
    const height = (width / dims.width) * dims.height;
    if (y - height < 60) y = 60 + height;
    page.drawImage(png, { x: margin, y: y - height, width, height });
    y -= height + 12;
    page.drawText(`${input.providerName} · ${input.signedAt}`, {
      x: margin,
      y: y - 4,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  } else if (!input.note?.trim()) {
    page.drawText(`Signed by ${input.providerName} · ${input.signedAt}`, {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  return Buffer.from(await pdfDoc.save());
}

async function imageToPdfWithAnnotation(
  imageBytes: Buffer,
  mimeType: string,
  input: DocumentAnnotationInput
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const embedded =
    mimeType === "image/png"
      ? await pdfDoc.embedPng(imageBytes)
      : mimeType === "image/jpeg" || mimeType === "image/jpg"
        ? await pdfDoc.embedJpg(imageBytes)
        : null;
  if (!embedded) {
    throw new Error("Unsupported image type for annotation");
  }
  const dims = embedded.scale(1);
  const page = pdfDoc.addPage([612, 792]);
  const maxW = 512;
  const maxH = 620;
  const scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
  const width = dims.width * scale;
  const height = dims.height * scale;
  page.drawImage(embedded, {
    x: (612 - width) / 2,
    y: 792 - 50 - height,
    width,
    height,
  });
  const base = Buffer.from(await pdfDoc.save());
  return appendPdfAnnotationPage(base, input);
}

export async function annotateDocumentBytes(
  bytes: Buffer,
  mimeType: string,
  input: DocumentAnnotationInput
): Promise<{ bytes: Buffer; mimeType: string; fileNameSuffix?: string }> {
  const hasNote = Boolean(input.note?.trim());
  const hasSign = Boolean(input.signaturePngDataUrl);
  if (!hasNote && !hasSign) {
    throw new Error("Nothing to append");
  }

  if (mimeType === "application/pdf" || bytes.slice(0, 4).toString() === "%PDF") {
    return {
      bytes: await appendPdfAnnotationPage(bytes, input),
      mimeType: "application/pdf",
    };
  }

  if (mimeType.startsWith("image/")) {
    return {
      bytes: await imageToPdfWithAnnotation(bytes, mimeType, input),
      mimeType: "application/pdf",
      fileNameSuffix: ".pdf",
    };
  }

  if (mimeType.startsWith("text/html")) {
    const html = bytes.toString("utf8");
    const footer = buildHtmlFooter(input);
    const updated = html.includes("</body>")
      ? html.replace("</body>", `${footer}</body>`)
      : `${html}${footer}`;
    return { bytes: Buffer.from(updated, "utf8"), mimeType: "text/html; charset=utf-8" };
  }

  if (mimeType.startsWith("text/") || mimeType === "application/octet-stream") {
    return {
      bytes: Buffer.from(bytes.toString("utf8") + buildTextFooter(input), "utf8"),
      mimeType: mimeType.startsWith("text/") ? mimeType : "text/plain",
    };
  }

  throw new Error("This document type cannot be annotated yet. Use PDF, text, HTML, or an image.");
}

export function appendHtmlAnnotation(html: string, input: DocumentAnnotationInput): string {
  const footer = buildHtmlFooter(input);
  return html.includes("</body>") ? html.replace("</body>", `${footer}</body>`) : `${html}${footer}`;
}
