"use client";

import { useRef, useState, type ReactNode } from "react";
import { type FactorKey, COMPARISON_FACTORS, type PredictionResponse } from "@/components/types";
import DistanceHistogram from "@/components/charts/DistanceHistogram";
import FactorBarChart, { type BarDatum } from "@/components/charts/FactorBarChart";
import FactorGauge from "@/components/charts/FactorGauge";
import {
  formatCategorySummary,
  generateDecisionHeadline,
  generateFactorHeadline,
  generateFactorInsight,
  generateImprovementSuggestions,
  generateKeyRisks,
  histogramSummary,
  isPrimaryDriver,
  LOCATION_ONLY_DISCLAIMER,
  scoreBand,
  summarizeCompetitorCategories,
  summaryFactor,
} from "@/lib/insights";
import { exportReportToPdf } from "@/lib/pdfExport";
import { buildStaticMapUrl } from "@/lib/staticMap";
import { readableFeatureName, resultAccentColors, resultBadgeClasses } from "@/lib/utils";

const FACTOR_COLORS: Record<string, string> = {
  Demand: "#2563eb",
  Population: "#7c3aed",
  Accessibility: "#059669",
  Competition: "#ea580c",
};

const RAW_COUNT_LABELS: Record<string, string> = {
  cinema: "Cinemas",
  museum: "Museums",
  temple: "Temples",
  recreation: "Recreation venues",
  office: "Offices",
  college: "Colleges",
  school: "Schools",
  hospital: "Hospitals",
  clinic: "Clinics",
  retail: "Retail places",
  bank: "Banks",
  bus_stop: "Bus stops",
  parking_space: "Parking spaces",
  intersection: "Road intersections",
  competitor_count: "Existing restaurants within 500 m",
  building_count: "Mapped buildings within 500 m",
};

function barDataForFactor(factorKey: FactorKey, prediction: PredictionResponse): BarDatum[] {
  const rawCounts = prediction.site_detail.raw_counts;
  const typicalCounts = prediction.site_detail.typical_counts;
  switch (factorKey) {
    case "Demand":
      return (Object.keys(rawCounts.demand) as Array<keyof typeof rawCounts.demand>).map((key) => ({
        key,
        label: RAW_COUNT_LABELS[key] ?? key,
        count: rawCounts.demand[key],
        typical: typicalCounts.demand[key] ?? null,
      }));
    case "Accessibility":
      return (Object.keys(rawCounts.accessibility) as Array<keyof typeof rawCounts.accessibility>).map((key) => ({
        key,
        label: RAW_COUNT_LABELS[key] ?? key,
        count: rawCounts.accessibility[key],
        typical: typicalCounts.accessibility[key] ?? null,
      }));
    case "Competition":
      return [
        {
          key: "competitor_count",
          label: RAW_COUNT_LABELS.competitor_count,
          count: rawCounts.competition.competitor_count,
          typical: typicalCounts.competition.competitor_count ?? null,
        },
      ];
    case "Population":
      return [
        {
          key: "building_count",
          label: RAW_COUNT_LABELS.building_count,
          count: rawCounts.population.building_count,
          typical: typicalCounts.population.building_count ?? null,
        },
      ];
    default:
      return [];
  }
}

type SectionDef = { id: string; title: string; navLabel: string; defaultOpen: boolean };

const SECTIONS: SectionDef[] = [
  { id: "report-overview", title: "Report overview", navLabel: "Overview", defaultOpen: true },
  { id: "report-summary", title: "Executive summary", navLabel: "Summary", defaultOpen: true },
  { id: "report-glance", title: "At a glance", navLabel: "At a glance", defaultOpen: true },
  { id: "report-map", title: "Location map", navLabel: "Map", defaultOpen: true },
  { id: "report-factors", title: "Factor breakdown", navLabel: "Factors", defaultOpen: true },
  { id: "report-competitors", title: "Competitor landscape", navLabel: "Competitors", defaultOpen: true },
  { id: "report-risks", title: "Key risks", navLabel: "Risks", defaultOpen: true },
  { id: "report-improve", title: "What would improve this site", navLabel: "Improve", defaultOpen: true },
  {
    id: "report-methodology",
    title: "Methodology appendix — advanced / technical",
    navLabel: "Methodology",
    defaultOpen: false,
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ReportSectionProps = {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  registerRef: (id: string, element: HTMLElement | null) => void;
  registerHeaderRef?: (id: string, element: HTMLElement | null) => void;
  children: ReactNode;
};

function ReportSection({ id, title, isOpen, onToggle, registerRef, registerHeaderRef, children }: ReportSectionProps) {
  return (
    <section
      className="mt-4 scroll-mt-14 overflow-hidden rounded-2xl border border-gray-100 bg-white"
      id={id}
      ref={(element) => registerRef(id, element)}
    >
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={onToggle}
        ref={registerHeaderRef ? (element) => registerHeaderRef(id, element) : undefined}
        type="button"
      >
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
        <ChevronIcon open={isOpen} />
      </button>
      {isOpen && <div className="border-t border-gray-100 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

type ReportPanelProps = {
  prediction: PredictionResponse | null;
};

export default function ReportPanel({ prediction }: ReportPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((section) => [section.id, section.defaultOpen])),
  );
  const [isExporting, setIsExporting] = useState(false);
  const sectionElements = useRef<Map<string, HTMLElement>>(new Map());
  const sectionHeaderElements = useRef<Map<string, HTMLElement>>(new Map());
  const factorCardElements = useRef<Map<FactorKey, HTMLElement>>(new Map());

  const toggleSection = (id: string) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  };

  const registerRef = (id: string, element: HTMLElement | null) => {
    if (element) sectionElements.current.set(id, element);
    else sectionElements.current.delete(id);
  };

  const registerHeaderRef = (id: string, element: HTMLElement | null) => {
    if (element) sectionHeaderElements.current.set(id, element);
    else sectionHeaderElements.current.delete(id);
  };

  const registerFactorCardRef = (key: FactorKey, element: HTMLElement | null) => {
    if (element) factorCardElements.current.set(key, element);
    else factorCardElements.current.delete(key);
  };

  if (!prediction) {
    return (
      <div>
        <h3 className="text-4xl font-semibold text-gray-900">Report</h3>
        <p className="mt-3 text-sm leading-6 text-gray-500">
          Analyze a location to generate a full report you can review here or download as a PDF.
        </p>
      </div>
    );
  }

  const accent = resultAccentColors(prediction.predicted_label);
  const { raw_counts: rawCounts, nearby_competitors: nearbyCompetitors, competitor_distance_histogram: distanceHistogram } =
    prediction.site_detail;
  const topFactor = summaryFactor(prediction.explanation.factors);
  const topFactorHeadline = topFactor
    ? generateFactorHeadline(
        topFactor.feature as FactorKey,
        prediction.benchmark[topFactor.feature as FactorKey]?.percentile ?? 50,
        isPrimaryDriver(prediction.explanation.factors, topFactor.feature as FactorKey),
        prediction.predicted_label,
        rawCounts,
      )
    : null;
  const categorySummary = summarizeCompetitorCategories(nearbyCompetitors);
  const categorySummaryText = formatCategorySummary(categorySummary);
  const histogramNote = histogramSummary(distanceHistogram);
  const keyRisks = generateKeyRisks(prediction);
  const improvementSuggestions = generateImprovementSuggestions(prediction);
  const mapUrl = buildStaticMapUrl(prediction.latitude, prediction.longitude, { width: 640, height: 360 });
  const siteName = `${prediction.area_information.search_area} site`;

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    const previousOpenState = openSections;
    setOpenSections(Object.fromEntries(SECTIONS.map((section) => [section.id, true])));
    // Wait for React to re-render the now-expanded sections before capturing them.
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      const sections: { title: string; element: HTMLElement }[] = [];
      for (const section of SECTIONS) {
        if (section.id === "report-factors") {
          // Captured as separate blocks (header + one per factor card) rather than one monolithic
          // section image, so the page-fit logic can move a whole factor card to a new page instead
          // of slicing it mid-row when the combined section is taller than one page.
          const headerElement = sectionHeaderElements.current.get(section.id);
          if (headerElement) sections.push({ title: section.title, element: headerElement });
          for (const factor of COMPARISON_FACTORS) {
            const cardElement = factorCardElements.current.get(factor.key);
            if (cardElement) sections.push({ title: `${section.title} — ${factor.label}`, element: cardElement });
          }
          continue;
        }
        const element = sectionElements.current.get(section.id);
        if (element) sections.push({ title: section.title, element });
      }
      await exportReportToPdf(sections, siteName);
    } finally {
      setOpenSections(previousOpenState);
      setIsExporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-4xl font-semibold text-gray-900">Report</h3>
        <button
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isExporting}
          onClick={handleDownloadPdf}
          type="button"
        >
          {isExporting ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>

      <nav aria-label="Report sections" className="sticky top-0 z-10 mt-4 flex flex-wrap gap-1 border-b border-gray-100 bg-white py-2">
        {SECTIONS.map((section) => (
          <a
            className="rounded-full px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            href={`#${section.id}`}
            key={section.id}
          >
            {section.navLabel}
          </a>
        ))}
      </nav>

      <ReportSection
        id="report-overview"
        isOpen={openSections["report-overview"]}
        onToggle={() => toggleSection("report-overview")}
        registerRef={registerRef}
        title="Report overview"
      >
        <h2 className="text-lg font-bold text-gray-900">{siteName}</h2>
        <p className="mt-1 text-sm text-gray-600">
          {prediction.latitude.toFixed(5)}, {prediction.longitude.toFixed(5)} · 500 m analysis radius ·{" "}
          {prediction.area_information.search_area} ({Math.round(prediction.area_information.distance_from_area_center_m)} m
          from area center)
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Generated {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} · Data
          sources: Google Places API, OpenStreetMap
        </p>
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {LOCATION_ONLY_DISCLAIMER}
        </div>
      </ReportSection>

      <ReportSection
        id="report-summary"
        isOpen={openSections["report-summary"]}
        onToggle={() => toggleSection("report-summary")}
        registerRef={registerRef}
        title="Executive summary"
      >
        <p className={`text-lg font-bold ${accent.text}`}>{generateDecisionHeadline(prediction.predicted_label)}</p>
        <span
          className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${resultBadgeClasses(prediction.predicted_label)}`}
        >
          {prediction.predicted_label} feasibility
        </span>
        {topFactorHeadline && <p className="mt-3 text-sm leading-6 text-gray-600">{topFactorHeadline}</p>}
      </ReportSection>

      <ReportSection
        id="report-glance"
        isOpen={openSections["report-glance"]}
        onToggle={() => toggleSection("report-glance")}
        registerRef={registerRef}
        title="At a glance"
      >
        <div className="grid grid-cols-2 gap-3">
          {COMPARISON_FACTORS.map((factor) => {
            const rawValue = Number(prediction.collected_features[factor.key]) || 0;
            const benchmark = prediction.benchmark[factor.key];
            const band = scoreBand(benchmark?.percentile ?? 50);
            return (
              <FactorGauge
                band={band}
                color={FACTOR_COLORS[factor.key] ?? "#6b7280"}
                factorKey={factor.key}
                key={factor.key}
                label={factor.label}
                mean={benchmark?.mean ?? null}
                percentile={benchmark?.percentile ?? null}
                value={Math.max(0, Math.min(1, rawValue))}
              />
            );
          })}
        </div>
      </ReportSection>

      <ReportSection
        id="report-map"
        isOpen={openSections["report-map"]}
        onToggle={() => toggleSection("report-map")}
        registerRef={registerRef}
        title="Location map"
      >
        {mapUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Static Maps image, must render reliably for PDF capture
          <img alt={`Map of ${siteName} with 500 m analysis radius`} className="w-full rounded-xl border border-gray-100" src={mapUrl} />
        ) : (
          <p className="text-xs text-gray-400">Map unavailable — enable the Maps Static API for this project&apos;s API key.</p>
        )}
        <p className="mt-2 text-xs text-gray-400">Blue circle marks the 500 m radius used to compute every factor below.</p>
      </ReportSection>

      <ReportSection
        id="report-factors"
        isOpen={openSections["report-factors"]}
        onToggle={() => toggleSection("report-factors")}
        registerHeaderRef={registerHeaderRef}
        registerRef={registerRef}
        title="Factor breakdown"
      >
        <div className="space-y-5">
          {COMPARISON_FACTORS.map((factor) => {
            const percentile = prediction.benchmark[factor.key]?.percentile ?? 50;
            const headline = generateFactorHeadline(
              factor.key,
              percentile,
              isPrimaryDriver(prediction.explanation.factors, factor.key),
              prediction.predicted_label,
              rawCounts,
            );
            const insight = generateFactorInsight(
              factor.key,
              percentile,
              rawCounts,
              prediction.site_detail.typical_counts,
              factor.key === "Competition" ? categorySummary[0]?.category ?? null : null,
            );
            return (
              <div
                className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                key={factor.key}
                ref={(element) => registerFactorCardRef(factor.key, element)}
              >
                <h5 className="text-sm font-semibold text-gray-900">{factor.label}</h5>
                <p className="mt-3 text-sm leading-6 text-gray-600">{headline}</p>
                <div className="mt-3 rounded-lg bg-blue-50 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">What this means for you</p>
                  <p className="mt-0.5 text-xs leading-5 text-blue-900">{insight}</p>
                </div>
                <FactorBarChart color={FACTOR_COLORS[factor.key] ?? "#6b7280"} data={barDataForFactor(factor.key, prediction)} />
              </div>
            );
          })}
        </div>
      </ReportSection>

      <ReportSection
        id="report-competitors"
        isOpen={openSections["report-competitors"]}
        onToggle={() => toggleSection("report-competitors")}
        registerRef={registerRef}
        title="Competitor landscape"
      >
        {nearbyCompetitors.length === 0 ? (
          <p className="text-sm text-gray-500">No existing competitors were found within 500 m.</p>
        ) : (
          <>
            {categorySummaryText && <p className="text-sm leading-5 text-gray-600">{categorySummaryText}</p>}
            <ol className="mt-2 space-y-2">
              {nearbyCompetitors.slice(0, 10).map((competitor, index) => (
                <li className="flex items-center justify-between gap-2 text-xs" key={`${competitor.name}-${index}`}>
                  <span className="min-w-0 truncate text-gray-700">
                    {index + 1}. {competitor.name}
                    {competitor.category && <span className="text-gray-400"> · {competitor.category}</span>}
                  </span>
                  <span className="shrink-0 text-gray-500">
                    {competitor.rating !== null ? `★ ${competitor.rating.toFixed(1)}` : "no rating"} ·{" "}
                    {Math.round(competitor.distance_m)} m
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold text-gray-500">Competitor distance (0–500 m)</p>
              <div className="mt-2">
                <DistanceHistogram buckets={distanceHistogram} color={FACTOR_COLORS.Competition} />
              </div>
              {histogramNote && <p className="mt-2 text-xs text-gray-500">{histogramNote}</p>}
            </div>
          </>
        )}
      </ReportSection>

      <ReportSection
        id="report-risks"
        isOpen={openSections["report-risks"]}
        onToggle={() => toggleSection("report-risks")}
        registerRef={registerRef}
        title="Key risks"
      >
        <ul className="space-y-2.5">
          {keyRisks.map((risk, index) => (
            <li className="flex gap-2 text-sm leading-6 text-gray-700" key={index}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
              {risk}
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection
        id="report-improve"
        isOpen={openSections["report-improve"]}
        onToggle={() => toggleSection("report-improve")}
        registerRef={registerRef}
        title="What would improve this site"
      >
        <ul className="space-y-2.5">
          {improvementSuggestions.map((suggestion, index) => (
            <li className="flex gap-2 text-sm leading-6 text-gray-700" key={index}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              {suggestion}
            </li>
          ))}
        </ul>
      </ReportSection>

      <ReportSection
        id="report-methodology"
        isOpen={openSections["report-methodology"]}
        onToggle={() => toggleSection("report-methodology")}
        registerRef={registerRef}
        title="Methodology appendix — advanced / technical"
      >
        <p className="text-[11px] leading-5 text-gray-400">
          This section is optional / advanced. It describes the underlying model in technical terms for readers who want to
          verify the methodology.
        </p>
        <div className="mt-3 space-y-3">
          {prediction.explanation.factors.map((factor, index) => (
            <div key={factor.feature}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">
                  {index + 1}. {readableFeatureName(factor.feature)}
                </span>
                <span
                  className={
                    factor.direction === "supports" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"
                  }
                >
                  {factor.strength} {factor.direction}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">{factor.description}</p>
            </div>
          ))}
          <p className="text-[11px] leading-5 text-gray-400">
            SHAP values show how each factor moved the model toward or away from the predicted feasibility class, relative
            to the other factors for this specific prediction.
          </p>
        </div>
      </ReportSection>
    </div>
  );
}
