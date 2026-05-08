import type { RaiseResult, DealResult } from "@/types";

export async function downloadRaisePDF(data: RaiseResult) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.default ?? (jspdfModule as { jsPDF?: typeof jspdfModule.default }).jsPDF;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210;
  const margin = 20;
  let y = 20;

  const ensurePage = (needed = 20) => {
    if (y + needed > 275) {
      doc.addPage();
      doc.setFillColor(8, 11, 15);
      doc.rect(0, 0, W, 297, "F");
      y = 20;
    }
  };

  const line = () => {
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.3);
    doc.line(margin, y, W - margin, y);
    y += 6;
  };

  const sectionHeading = (text: string) => {
    ensurePage(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(201, 168, 76);
    doc.text(text, margin, y);
    y += 7;
  };

  // Background
  doc.setFillColor(8, 11, 15);
  doc.rect(0, 0, W, 297, "F");

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(201, 168, 76);
  doc.text("MERIDIAN — CAPITAL RAISE BRIEF — CONFIDENTIAL", W / 2, y, { align: "center" });
  y += 8;
  line();

  // Company / Deal Overview
  doc.setFontSize(18);
  doc.setTextColor(240, 237, 230);
  doc.text(data.companyName, margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `${data.sector}  |  ${data.stage}  |  ${data.amount}  |  ${data.geography}`,
    margin, y
  );
  y += 4;
  line();

  // Company summary
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(240, 237, 230);
  const summaryLines = doc.splitTextToSize(data.companySummary, W - margin * 2);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 5 + 8;

  // ── Comparable Raises ────────────────────────────────────────────────────
  if (data.comparableRaises && data.comparableRaises.length > 0) {
    ensurePage(20);
    line();
    sectionHeading("COMPARABLE RAISES");

    data.comparableRaises.slice(0, 5).forEach((c) => {
      ensurePage(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(240, 237, 230);
      doc.text(c.companyName, margin + 2, y);
      y += 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(201, 168, 76);
      const meta = [c.amount, c.stage, c.sector, c.geography, c.date].filter(Boolean).join("  |  ");
      doc.text(meta, margin + 2, y);
      y += 4;

      if (c.keyInvestors) {
        doc.setTextColor(107, 114, 128);
        doc.text(`Investors: ${c.keyInvestors}`, margin + 2, y);
        y += 4;
      }
      y += 3;
    });
  }

  // ── Matched Investors ────────────────────────────────────────────────────
  ensurePage(20);
  line();
  sectionHeading("MATCHED INVESTORS");

  data.investors.forEach((inv, i) => {
    ensurePage(30);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(240, 237, 230);
    doc.text(`${i + 1}. ${inv.name}`, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(201, 168, 76);
    doc.text(inv.type, margin + doc.getTextWidth(`${i + 1}. ${inv.name}`) + 4, y);
    y += 5;

    doc.setTextColor(107, 114, 128);
    doc.text(
      `Cheque: ${inv.chequeSize}  |  Focus: ${inv.sectorFocus.join(", ")}  |  Geo: ${inv.geographicFocus}`,
      margin + 4, y
    );
    y += 5;

    doc.setTextColor(240, 237, 230);
    const fitLines = doc.splitTextToSize(inv.whyTheyFit, W - margin * 2 - 8);
    doc.text(fitLines, margin + 4, y);
    y += fitLines.length * 4 + 2;

    doc.setTextColor(107, 114, 128);
    const outreachLines = doc.splitTextToSize(`Outreach: ${inv.outreachAngle}`, W - margin * 2 - 8);
    doc.text(outreachLines, margin + 4, y);
    y += outreachLines.length * 4 + 2;

    const activityColors: Record<string, [number, number, number]> = {
      "Recently Active": [34, 197, 94],
      "Active": [201, 168, 76],
      "Quiet": [239, 68, 68],
      "Unknown": [107, 114, 128],
    };
    const [r, g, b] = activityColors[inv.fundActivity] ?? [107, 114, 128];
    doc.setTextColor(r, g, b);
    doc.text(`● ${inv.fundActivity}`, margin + 4, y);
    y += 8;
  });

  // ── Pitch Positioning Guide ───────────────────────────────────────────────
  if (data.pitchPositioning && data.pitchPositioning.length > 0) {
    ensurePage(20);
    line();
    sectionHeading("PITCH POSITIONING GUIDE");

    data.pitchPositioning.forEach((item) => {
      ensurePage(40);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(201, 168, 76);
      doc.text(`For ${item.investorType} Investors`, margin + 2, y);
      y += 5;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text("How to frame:", margin + 4, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(240, 237, 230);
      const frameLines = doc.splitTextToSize(item.howToFrame, W - margin * 2 - 8);
      doc.text(frameLines, margin + 4, y);
      y += frameLines.length * 4 + 2;

      if (item.keyMetrics?.length > 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text("Key metrics:", margin + 4, y);
        y += 4;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(240, 237, 230);
        item.keyMetrics.forEach((m) => {
          ensurePage(6);
          doc.text(`· ${m}`, margin + 6, y);
          y += 4;
        });
        y += 1;
      }

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(239, 68, 68);
      doc.text("Avoid:", margin + 4, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      const avoidLines = doc.splitTextToSize(item.whatToAvoid, W - margin * 2 - 18);
      doc.text(avoidLines, margin + 4 + doc.getTextWidth("Avoid: "), y);
      y += Math.max(avoidLines.length * 4, 4) + 2;

      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(34, 197, 94);
      doc.text("Intro:", margin + 4, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      const introLines = doc.splitTextToSize(item.idealIntro, W - margin * 2 - 16);
      doc.text(introLines, margin + 4 + doc.getTextWidth("Intro: "), y);
      y += Math.max(introLines.length * 4, 4) + 6;
    });
  }

  // ── Intelligence Sources ──────────────────────────────────────────────────
  if (data.meta) {
    ensurePage(20);
    line();
    sectionHeading("INTELLIGENCE SOURCES");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `${data.meta.sourceCount} web sources  ·  ${data.meta.searchCount} searches  ·  Confidence: ${data.meta.dataConfidence}  ·  Quality: ${data.meta.analysisQuality ?? "N/A"}`,
      margin + 2, y
    );
    y += 5;
    doc.text(
      `Generated: ${new Date(data.meta.generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      margin + 2, y
    );
    y += 8;
  }

  // Footer
  ensurePage(10);
  line();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `Generated by Meridian Intelligence — meridian.app  |  ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}`,
    W / 2, y, { align: "center" }
  );

  doc.save(`Meridian_Raise_Brief_${data.companyName.replace(/\s+/g, "_")}.pdf`);
}

export async function downloadDealPDF(data: DealResult) {
  const jspdfModule = await import("jspdf");
  const jsPDF = jspdfModule.default ?? (jspdfModule as { jsPDF?: typeof jspdfModule.default }).jsPDF;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210;
  const margin = 20;
  let y = 20;

  doc.setFillColor(8, 11, 15);
  doc.rect(0, 0, W, 297, "F");

  const line = () => {
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.3);
    doc.line(margin, y, W - margin, y);
    y += 6;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(201, 168, 76);
  doc.text("MERIDIAN — DEAL SIGNAL REPORT — CONFIDENTIAL", W / 2, y, { align: "center" });
  y += 8;
  line();

  doc.setFontSize(18);
  doc.setTextColor(240, 237, 230);
  doc.text(data.companyName, margin, y);
  y += 7;

  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Sector: ${data.sector}  |  Signal: ${data.signalStrength}  |  Confidence: ${data.dataConfidence}`, margin, y);
  y += 4;
  line();

  // Brief
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(240, 237, 230);
  const briefLines = doc.splitTextToSize(data.mandateBrief, W - margin * 2);
  doc.text(briefLines.slice(0, 60), margin, y);

  line();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated by Meridian — meridian.app  |  ${new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })}`, W / 2, 285, { align: "center" });

  doc.save(`Meridian_Deal_Brief_${data.companyName.replace(/\s+/g, "_")}.pdf`);
}
