export interface ExportFile {
  filename: string;
  content: string;
  mimeType: string;
}

export function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    const probe = new File(["x"], "probe.txt", { type: "text/plain" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Trigger a local download via Blob + object URL. Never touches the network. */
export function downloadFile({ filename, content, mimeType }: ExportFile): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Use the native share sheet when available, falling back to download. */
export async function shareOrDownload(file: ExportFile): Promise<"shared" | "downloaded" | "cancelled"> {
  if (canShareFiles()) {
    const f = new File([file.content], file.filename, { type: file.mimeType });
    try {
      await navigator.share({ files: [f], title: file.filename });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Fall through to download on any other share failure.
    }
  }
  downloadFile(file);
  return "downloaded";
}

export function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "export";
}
