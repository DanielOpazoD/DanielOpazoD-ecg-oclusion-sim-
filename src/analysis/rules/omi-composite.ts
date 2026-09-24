import { finding, type Finding } from './types.js';

/**
 * OMI composite (§8, [5,6,9]): positive if STEMI criteria or any subtle-OMI
 * rule fires. Takes the other findings as inputs via a lazy resolver.
 */
export function omiComposite(findings: readonly Finding[]): Finding {
  const pos = new Map(findings.filter((f) => f.positive).map((f) => [f.id, f]));
  const triggers = [
    'stemi-udmi4',
    'de-winter',
    'hyperacute-t',
    'posterior-std',
    'aslanger',
    'sgarbossa-modified',
    'barcelona',
    'south-african-flag',
    'terminal-qrs-distortion',
    // Wellens = reperfused critical LAD lesion — OMI-equivalent cath-lab trigger.
    'wellens',
  ].filter((id) => pos.has(id));
  const s4 = pos.get('smith-4v');
  if (s4 && (s4.score ?? 0) >= 18.2) triggers.push('smith-4v');
  const positive = triggers.length > 0;
  return finding(
    'omi-composite',
    'OMI (compuesto)',
    positive,
    [],
    { triggerCount: triggers.length },
    positive ? `OMI: reglas positivas ${triggers.join(', ')}.` : 'Sin criterios de oclusión aguda.',
    [5, 6, 9],
  );
}
