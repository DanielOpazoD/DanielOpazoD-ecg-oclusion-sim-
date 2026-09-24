import type { AnalysisReport } from '../analysis/index.js';
import { LEAD_IDS } from '../engine/index.js';

/** Markdown report of findings + measurements (for clipboard export). */
export function formatReport(
  report: AnalysisReport,
  ctx: { tMin: number; caseId?: string | null },
): string {
  const m = report.measurements;
  const lines: string[] = [
    `# Informe ECG — OMI Lab`,
    ``,
    `- Caso: ${ctx.caseId ?? 'laboratorio'} · t = ${ctx.tMin} min`,
    `- FC ${m.hrBpm.toFixed(0)} lpm · PR ${m.prMs.toFixed(0)} ms · QT ${m.qt.toFixed(0)} / QTc ${m.qtcBazett.toFixed(0)} ms`,
    `- Eje QRS ${m.qrsAxisDeg.toFixed(0)}° · eje T ${m.tAxisDeg.toFixed(0)}° · QRS ${m.qrsWide ? 'ancho' : 'estrecho'}`,
    ``,
    `## Veredicto`,
    ``,
    `- **OMI (compuesto): ${report.omi.positive ? 'positivo' : 'negativo'}** — ${report.omi.rationale}`,
    ``,
    `## Hallazgos`,
    ``,
    ...report.findings
      .filter((f) => f.positive)
      .map((f) => `- **${f.label}** (${f.leads.join(', ') || 'global'}): ${f.rationale}`),
    ``,
    `## ST por derivación (mm, J / J+60)`,
    ``,
    `| derivación | ST J | ST 60 |`,
    `|---|---|---|`,
    ...LEAD_IDS.map(
      (l) =>
        `| ${l} | ${(m.perLead[l].stJ * 10).toFixed(1)} | ${(m.perLead[l].st60 * 10).toFixed(1)} |`,
    ),
  ];
  return lines.join('\n');
}

/** Download the ECG canvas as PNG. */
export function exportPng(canvas: HTMLCanvasElement, name = 'ecg.png'): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

export async function copyReport(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text);
}
