// html2canvas-pro, not html2canvas: the original package can't parse the oklch()/lab() color
// functions Tailwind v4 emits by default, and throws mid-capture ("Attempting to parse an
// unsupported color function") -- confirmed via a live export attempt. html2canvas-pro is the
// actively-maintained fork built specifically for this gap, drop-in compatible otherwise.
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

const PAGE_MARGIN_PT = 36;
const HEADER_HEIGHT_PT = 20;
const FOOTER_HEIGHT_PT = 18;
const SECTION_GAP_PT = 10;
const CANVAS_SCALE = 1.5;
const JPEG_QUALITY = 0.82;

type ReportSectionCapture = {
  title: string;
  element: HTMLElement;
};

/**
 * Renders each report section's actual DOM node to a PDF page via html2canvas + jsPDF, capturing
 * the real gauges/bars/map exactly as shown on screen (single source of truth -- no parallel
 * chart implementation). Sections are captured and placed individually so a section only starts a
 * new page if it wouldn't fit in the remaining space, never split mid-section; the rare section
 * taller than a full page is sliced across pages rather than left off or overflowing.
 */
export async function exportReportToPdf(sections: ReportSectionCapture[], siteName: string): Promise<void> {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN_PT * 2;
  const contentTop = PAGE_MARGIN_PT + HEADER_HEIGHT_PT;
  const contentBottom = pageHeight - PAGE_MARGIN_PT - FOOTER_HEIGHT_PT;
  const usableHeight = contentBottom - contentTop;

  let cursorY = contentTop;
  let pageNumber = 1;
  let totalPages = 1;

  const drawHeader = () => {
    pdf.setFontSize(9);
    pdf.setTextColor(107, 114, 128);
    pdf.text(siteName, PAGE_MARGIN_PT, PAGE_MARGIN_PT + 10);
    pdf.setDrawColor(229, 231, 235);
    pdf.line(PAGE_MARGIN_PT, PAGE_MARGIN_PT + 16, pageWidth - PAGE_MARGIN_PT, PAGE_MARGIN_PT + 16);
  };

  const startNewPage = () => {
    pdf.addPage();
    pageNumber += 1;
    totalPages = pageNumber;
    cursorY = contentTop;
    drawHeader();
  };

  drawHeader();

  for (const section of sections) {
    const canvas = await html2canvas(section.element, {
      scale: CANVAS_SCALE,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });

    const imageHeight = (canvas.height / canvas.width) * contentWidth;

    if (imageHeight <= usableHeight) {
      if (cursorY + imageHeight > contentBottom && cursorY > contentTop) {
        startNewPage();
      }
      pdf.addImage(
        canvas.toDataURL("image/jpeg", JPEG_QUALITY),
        "JPEG",
        PAGE_MARGIN_PT,
        cursorY,
        contentWidth,
        imageHeight,
      );
      cursorY += imageHeight + SECTION_GAP_PT;
      continue;
    }

    // A single section taller than one page (e.g. a long competitor list) -- slice it across
    // pages rather than overflow off the bottom or split it awkwardly mid-line.
    if (cursorY > contentTop) {
      startNewPage();
    }
    const pixelsPerPoint = canvas.width / contentWidth;
    const pageHeightPx = usableHeight * pixelsPerPoint;
    let renderedPx = 0;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const context = sliceCanvas.getContext("2d");
      if (context) {
        context.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
      }
      const sliceHeightPt = sliceHeightPx / pixelsPerPoint;
      pdf.addImage(
        sliceCanvas.toDataURL("image/jpeg", JPEG_QUALITY),
        "JPEG",
        PAGE_MARGIN_PT,
        contentTop,
        contentWidth,
        sliceHeightPt,
      );
      renderedPx += sliceHeightPx;
      cursorY = contentTop + sliceHeightPt;
      if (renderedPx < canvas.height) {
        startNewPage();
      }
    }
    cursorY += SECTION_GAP_PT;
  }

  // Footer (page numbers) is added last, once the final page count is known.
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    pdf.text(`Page ${page} of ${totalPages}`, pageWidth - PAGE_MARGIN_PT, pageHeight - PAGE_MARGIN_PT + 8, {
      align: "right",
    });
  }

  const fileSlug = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  pdf.save(`yogya-site-${fileSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
