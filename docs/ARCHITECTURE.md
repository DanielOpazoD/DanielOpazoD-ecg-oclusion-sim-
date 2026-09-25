# Arquitectura — ECG Lab

## Flujo de datos

```
Scenario (declarativo: ritmo, conducción, fuentes, timeline, adquisición, seed)
   │
   ▼  generateEcg(scenario, tMin)
timeline.resolve  ──► InjurySource efectivo (fracciones de st/hT/tInv/qLoss por t)
   │
   ▼  schedule de eventos (atrial + ventricular + spikes; rrMs con memoria QT)
beat dipole H(τ)  ──► vector 3D: P + QRS gaussianas + ST-T Hermite + lesiones
   │                          (+ jitter por paciente si variability)
   ▼
proyección de derivaciones (matriz tipo Dower + colocación)  ──►  clean  (verdad)
   │
   ▼  addNoise + HP/LP
Ecg12 { leads (adquirida), clean, beats (fiduciales), schedule, fs }
   │
   ▼  analyzeEcg (source: 'clean' | 'acquired')
suppressImpulses ──► delineate (muestras; picos, bordes QRS por energía de pendiente,
                     P/T multiderivación, autocorrelación auricular, evidencia por métrica)
   │
   ▼  auditDelineation (retira métricas que se desvían de los fiduciales)
Delineation auditada + Measurements (latido dominante, fiduciales)
   │
   ▼  RuleContext { delineation, measurements, ecg, patient, conduction, qrsContext, leadsAvailable }
14 reglas OMI (+ notApplicable si qrsContext ancho) + 16 reglas generales ──► Finding[]
   │
   ▼
UI: shell (modos) · renderer (papel) · monitor · paneles · quiz · persistencia · PNG
```

## Responsabilidades por módulo

- `src/engine/`: matemática pura, sin DOM. `math/` (vec3, splines Hermite, gaussianas, PRNG
  mulberry32), `leads.ts` (sistema de derivaciones + colocación, dextrocardia), `territories.ts`
  (vectores de lesión), `beat.ts` (dipolo con P separada, memoria QT, overrides), `rhythm.ts`
  + `schedule.ts` (eventos atriales/ventriculares, ESV/ESA, bloqueos, marcapasos, torsades, FV),
  `timeline.ts`, `acquisition.ts` (ruido/filtros, 30/60 s de tira), `scenario.ts` (orquestación
  → `Ecg12`, `ModelScopeError` para combinaciones físicamente inviables).
- `src/analysis/`: `delineate/` (supresión de spikes, estadística robusta, evidencia,
  delineación por muestras), `audit.ts` (retirada de métricas vs fiduciales), `measure.ts`
  (fiduciales → latido dominante), `rules/` (OMI: un fichero por regla; `general.ts`: 16
  reglas clínicas), `index.ts` (`analyzeEcg`: contexto, gating por `qrsContext`, compuesto).
- `src/cases/`: `CaseDefinition` × 103, grupos `groupA.ts`…`groupN.ts`, `types.ts`
  (`category`, `diagnosis`, `distractors`), `index.ts` (`CASES`, `getCase`).
- `src/ui/`: `app.ts` (shell, modos, export), `state/` (store + AppState), `ecg/`
  (renderer, downsampling min/max, monitor, beatDetail, calipers, vectorView), `panels/`
  (clínica, hallazgos, docencia, latido, vectores, tarjetas de métricas), `modes/`
  (casos, quiz), `export/` (PNG 300 dpi + pHYs), `data/` (bibliografía 1–128), `styles/`.
- `src/persistence/`: `urlState` (`?s=` base64url), `jsonIO` (importar/exportar escenario),
  `savedCases` (localStorage `ecglab.savedCases.v1`).
- `tools/`: inspección CLI (`dump-beat`, `dump-cases`).

## Patrón de estado

Un único `createStore<AppState>` con `get/set/update/subscribe`. La UI se re-renderiza por
suscripción; `regenerate()` corre cuando cambian escenario/tMin/paciente/fuente de análisis.

## Renderizado

Canvas 2D con `devicePixelRatio`, rejilla en mm real (1 mm menor / 5 mm mayor, en modo
oscuro alfa ≈ 0.18 / 0.38), traza rasterizada por min/max por columna de píxel (no pierde
picos de 4 ms). Layouts 3x4, 3x4+II, 3x4+3 tiras, 6x2, 12x1; orden estándar o Cabrera;
secuencial o simultáneo; velocidad 25/50 mm/s; ganancia 5/10/20 mm/mV. `vectorView`
proyecta ejes QRS/T y vectores de lesión. `monitor` barre II + V1 con FC numérica,
congelado y bip WebAudio (respeta `prefers-reduced-motion`).

## Testing

- Unitarios (Vitest): store, medición, reglas, delineación (PR/QT/axis/regularidad), URL
  state, jsonIO, savedCases, downsampler, opciones de quiz, tarjetas.
- Propiedades (fast-check) en engine/math/delineate.
- Aceptación por caso: cada caso genera su ECG en `ecgAtMin` y sus `positiveFindings` /
  `negativeFindings` se verifican contra el motor de reglas real.

## Determinismo

Mismo `Scenario` + misma `seed` ⇒ misma señal. El PRNG (mulberry32) cubre schedule, ruido
y — en un stream independiente — el jitter por paciente (`variability: false` lo desactiva).
