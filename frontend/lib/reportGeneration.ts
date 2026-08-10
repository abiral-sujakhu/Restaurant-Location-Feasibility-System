import { COMPARISON_FACTORS, type PredictionResponse } from "@/components/types";
import { generateFactorVerdict, generateRecommendation } from "@/lib/insights";
import { readableFeatureName } from "@/lib/utils";

function wrapPdfText(text: string, maximumLength = 88) {
  const words = text.replace(/[^\x20-\x7E]/g, " ").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if (`${currentLine} ${word}`.trim().length > maximumLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = `${currentLine} ${word}`.trim();
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
}

function pdfSafeText(text: string) {
  return text.replace(/[^\x20-\x7E]/g, " ").replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function createVisualPage(prediction: PredictionResponse) {
  const commands: string[] = ["0.97 0.98 1 rg 0 0 595 842 re f"];
  const text = (value: string, x: number, y: number, size = 10, color = "0.12 0.16 0.23") => {
    commands.push(`${color} rg BT /F1 ${size} Tf ${x} ${y} Td (${pdfSafeText(value)}) Tj ET`);
  };
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    commands.push(`${color} rg ${x} ${y} ${width} ${height} re f`);
  };

  text("YOGYA SITE", 48, 795, 22, "0.04 0.31 0.62");
  text("Restaurant location feasibility report", 48, 772, 11, "0.35 0.42 0.52");
  text(`${prediction.area_information.search_area}  |  ${prediction.latitude.toFixed(5)}, ${prediction.longitude.toFixed(5)}`, 48, 752, 9, "0.35 0.42 0.52");

  const resultColor = prediction.predicted_label.toLowerCase().includes("high")
    ? "0.02 0.55 0.35"
    : prediction.predicted_label.toLowerCase().includes("low")
      ? "0.86 0.25 0.24"
      : "0.91 0.55 0.08";
  rect(48, 682, 499, 52, resultColor);
  text("MODEL RESULT", 65, 714, 9, "1 1 1");
  text(prediction.predicted_label.toUpperCase() + " FEASIBILITY", 65, 692, 18, "1 1 1");
  text(`${Math.round(prediction.confidence * 100)}% confidence`, 420, 700, 11, "1 1 1");

  text("SITE FACTOR PROFILE", 48, 651, 14);
  text("Longer bars indicate stronger conditions in the model.", 48, 634, 9, "0.35 0.42 0.52");
  const factorColors = ["0.15 0.45 0.90", "0.49 0.27 0.89", "0.04 0.65 0.55", "0.93 0.45 0.12"];
  COMPARISON_FACTORS.forEach((factor, index) => {
    const rawValue = Number(prediction.collected_features[factor.key]) || 0;
    const value = Math.max(0, Math.min(1, rawValue));
    const y = 596 - index * 48;
    text(factor.label, 48, y + 8, 10);
    rect(165, y, 330, 14, "0.88 0.90 0.94");
    rect(165, y, Math.max(3, 330 * value), 14, factorColors[index]);
    text(`${(value * 100).toFixed(1)}/100`, 501, y + 3, 8);
  });

  text("WHAT MOVED THE PREDICTION", 48, 405, 14);
  rect(48, 381, 10, 10, "0.02 0.65 0.42");
  text("Supports result", 64, 382, 8, "0.35 0.42 0.52");
  rect(150, 381, 10, 10, "0.96 0.57 0.12");
  text("Opposes result", 166, 382, 8, "0.35 0.42 0.52");
  commands.push("0.70 0.73 0.78 RG 0.8 w 300 190 m 300 364 l S");
  prediction.explanation.factors.slice(0, 4).forEach((factor, index) => {
    const width = Math.max(4, Math.min(165, factor.relative_impact * 165));
    const y = 338 - index * 43;
    text(readableFeatureName(factor.feature), 48, y + 4, 9);
    if (factor.direction === "supports") {
      rect(300, y, width, 13, "0.02 0.65 0.42");
    } else {
      rect(300 - width, y, width, 13, "0.96 0.57 0.12");
    }
    text(`${Math.round(factor.relative_impact * 100)}%`, 480, y + 3, 8, "0.35 0.42 0.52");
  });

  rect(48, 75, 499, 82, "0.91 0.95 1");
  text("EXECUTIVE RECOMMENDATION", 65, 136, 11, "0.04 0.31 0.62");
  const recommendationLines = wrapPdfText(generateRecommendation(prediction), 95).slice(0, 2);
  recommendationLines.forEach((line, index) => {
    text(line, 65, 114 - index * 18, 9);
  });
  text("Higher bars are favorable; influence bars show model effect, not raw factor size.", 48, 43, 8, "0.35 0.42 0.52");
  return commands.join("\n");
}

function createTextPdf(lines: string[], prediction: PredictionResponse) {
  const textPages = Array.from(
    { length: Math.ceil(lines.length / 48) },
    (_, index) => lines.slice(index * 48, (index + 1) * 48),
  );
  const pageLines = [[], ...textPages] as string[][];
  const fontObjectId = 3 + pageLines.length * 2;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageLines.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageLines.length} >>`,
  ];

  pageLines.forEach((page, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const escapedLines = page.map((line) =>
      `(${line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj T*`,
    );
    const content = index === 0
      ? createVisualPage(prediction)
      : `BT /F1 10 Tf 48 794 Td 14 TL ${escapedLines.join(" ")} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n%YogyaSite\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const crossReferenceOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

/**
 * Builds the Report page's document order: Executive Summary -> Location
 * Snapshot -> Factor Breakdown (plain-language) -> Competitor Landscape ->
 * Recommendations -> Methodology appendix (SHAP/technical).
 */
function buildReportLines(prediction: PredictionResponse): string[] {
  const lines: string[] = [
    "YOGYA SITE - RESTAURANT LOCATION FEASIBILITY REPORT",
    "",
    `Generated: ${new Date().toLocaleString()}`,
    `Coordinates: ${prediction.latitude.toFixed(6)}, ${prediction.longitude.toFixed(6)}`,
    `Study area: ${prediction.area_information.search_area}`,
    `Feasibility result: ${prediction.predicted_label} (${Math.round(prediction.confidence * 100)}% confidence)`,
    "",
    "EXECUTIVE SUMMARY",
    ...wrapPdfText(generateRecommendation(prediction)),
    ...wrapPdfText(prediction.explanation.summary),
    "",
    "LOCATION SNAPSHOT",
    `Study area: ${prediction.area_information.search_area} | Distance from area center: ${Math.round(prediction.area_information.distance_from_area_center_m)} m`,
    "Supported boundary radius: 1500 m | Site feature radius: 500 m",
    ...wrapPdfText(
      "An interactive map with Demand, Accessibility, Competition, and Population layers is available in the app's Location Snapshot section.",
    ),
    "",
    "FACTOR BREAKDOWN",
  ];

  COMPARISON_FACTORS.forEach((factor) => {
    const value = prediction.collected_features[factor.key];
    const score = typeof value === "number" ? Math.round(value * 100) : value;
    lines.push(`${factor.label} - ${score}/100`);
    const shapFactor = prediction.explanation.factors.find((item) => item.feature === factor.key);
    if (shapFactor) {
      lines.push(...wrapPdfText(generateFactorVerdict(shapFactor, prediction.site_detail.raw_counts)));
    }
    lines.push("");
  });

  lines.push("COMPETITOR LANDSCAPE");
  const competitors = prediction.site_detail.nearby_competitors;
  if (competitors.length === 0) {
    lines.push("No existing competitors were found within 500 m.");
  } else {
    competitors.slice(0, 10).forEach((competitor, index) => {
      const ratingText = competitor.rating !== null ? `rating ${competitor.rating.toFixed(1)}` : "no rating";
      lines.push(
        `${index + 1}. ${competitor.name} - ${ratingText} - ${Math.round(competitor.distance_m)} m away`,
      );
    });
  }

  lines.push("", "RECOMMENDATIONS", ...wrapPdfText(generateRecommendation(prediction)));
  const opposingFactor = prediction.explanation.factors.find((factor) => factor.direction === "opposes");
  if (opposingFactor) {
    lines.push(
      ...wrapPdfText(
        `Consider comparing nearby locations with a stronger ${readableFeatureName(opposingFactor.feature).toLowerCase()} score before committing to this site.`,
      ),
    );
  }

  lines.push(
    "",
    "METHODOLOGY APPENDIX (ADVANCED / TECHNICAL)",
    ...wrapPdfText(prediction.explanation.summary),
    "",
    "INFLUENTIAL FACTORS (SHAP)",
  );
  prediction.explanation.factors.forEach((factor, index) => {
    lines.push(
      `${index + 1}. ${readableFeatureName(factor.feature)} - ${factor.strength} ${factor.direction}`,
    );
    lines.push(...wrapPdfText(factor.description));
  });
  lines.push(
    "",
    "NOTES",
    ...wrapPdfText(
      "Scores are model estimates based on nearby data. This report supports site screening and should not replace field research or financial due diligence.",
    ),
  );

  return lines;
}

function triggerDownload(blob: Blob, prediction: PredictionResponse, extension: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const areaName = prediction.area_information.search_area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  link.href = downloadUrl;
  link.download = `yogya-site-${areaName}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  link.click();
  URL.revokeObjectURL(downloadUrl);
}

export function downloadPdfReport(prediction: PredictionResponse) {
  const reportLines = buildReportLines(prediction);
  triggerDownload(createTextPdf(reportLines, prediction), prediction, "pdf");
}
