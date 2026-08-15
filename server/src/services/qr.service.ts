import QRCode from "qrcode";

const BASE = process.env.PUBLIC_BASE_URL || "http://localhost:5173";

export function playUrlFor(code: string): string {
  return `${BASE.replace(/\/$/, "")}/play?team=${encodeURIComponent(code)}`;
}

export async function qrPngDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(playUrlFor(code), {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 8,
    color: { dark: "#0a0a0f", light: "#e0e0ff" },
  });
}

export async function qrPngBuffer(code: string): Promise<Buffer> {
  return QRCode.toBuffer(playUrlFor(code), {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 8,
    color: { dark: "#0a0a0f", light: "#e0e0ff" },
  });
}
