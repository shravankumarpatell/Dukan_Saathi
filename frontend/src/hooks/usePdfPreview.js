import { useCallback, useState } from "react";

/**
 * Hold a PDF blob URL (+ download filename) for PdfViewerDialog.
 * Dialog revokes the blob URL when `url` changes / unmounts.
 *
 * showPdf accepts either a blob URL string or `{ url, filename }` from billPdf emit.
 */
export function usePdfPreview() {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [filename, setFilename] = useState("document.pdf");

  const showPdf = useCallback((result) => {
    if (!result) {
      setPdfUrl(null);
      setFilename("document.pdf");
      return;
    }
    if (typeof result === "string") {
      setPdfUrl(result);
      setFilename("document.pdf");
      return;
    }
    setPdfUrl(result.url || null);
    setFilename(result.filename || "document.pdf");
  }, []);

  const closePdf = useCallback(() => {
    setPdfUrl(null);
    setFilename("document.pdf");
  }, []);

  return { pdfUrl, filename, showPdf, closePdf };
}
