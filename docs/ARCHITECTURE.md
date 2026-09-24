# Arquitectura — OMI Lab

## Flujo de datos

```
Scenario (declarativo: ritmo, conducción, fuentes, timeline, adquisición, seed)
   │
   ▼  generateEcg(scenario, tMin)
timeline.resolve  ──► InjurySource efectivo (fracciones de st/hT/tInv/qLoss por t)
   │
   ▼  por latido (schedule de ritmo)
beat dipole H(τ)  ──► vector 3D: P + QRS gaussianas + ST-T Hermite + lesiones
   │                          (+ jitter por paciente si variability)
   ▼
proyección de derivaciones (matriz tipo Dower + colocación)  ──►  clean  (verdad)
   │
   ▼  addNoise + HP/LP
Ecg12 { leads (adquirida), clean, beats(fiduciales), fs }
   │
   ▼  measureEcg / analyzeEcg (source: 'clean' | 'acquired')
Measurements (latido dominante, ST J/60/80, R/S/T, ejes, PR/QRS/QT)
   │
   ▼  18 reglas → Finding[] → omi-composite
   │
   ▼
UI: renderer (papel), panels (hallazgos/medidas/docencia/lab), vectorView, quiz
```

## Responsabilidades por módulo

- `src/engine/`: matemática pura, sin DOM. `math/` (vec3, splines Hermite, gaussianas, PRNG
  mulberry32), `leads.ts` (sistema de derivaciones + colocación), `territories.ts` (vectores
  de lesión por arteria), `beat.ts` (dipolo del latido), `rhythm.ts` (schedule de latidos),
  `timeline.ts` (fracciones efectivas por `tMin`), `acquisition.ts` (ruido/filtros),
  `scenario.ts` (orquestación → `Ecg12`, variabilidad por `seed`).
- `src/analysis/`: `measure.ts` (mediciones sobre fiduciales, latido dominante mediano,
  sin detección), `rules/` (un fichero por regla, `Finding` con rationale y refs),
  `analyzeEcg` compone el informe.
- `src/cases/`: `CaseDefinition` × 50, `types.ts`, `index.ts` (`CASES`, `getCase`).
- `src/ui/`: `state/store.ts` (store tipado minimalista), `state/appState.ts` (AppState,
  `isBlind`), `ecg/` (renderer Canvas, monitor, calipers, vectorView), `panels/`,
  `modes/` (casos, quiz), `export.ts`, `data/bibliography.ts`, `labels.ts`.
- `tools/`: inspección CLI (`dump-beat`, `dump-cases`).

## Patrón de estado

Un único `createStore<AppState>` con `get/set/update/subscribe`. La UI se re-renderiza por
suscripción; la regeneración del ECG ocurre solo cuando cambia una firma relevante del
estado (escenario, tMin, paciente, vista).

## Renderizado

Canvas 2D con `devicePixelRatio` real, rejilla en mm (1 mm rosa menor / 5 mm mayor), traza
1.4 px; la rejilla se cachea offscreen. Layouts 3x4 (+tira II de 10 s), 6x2 y 12x1.
`vectorView` proyecta ejes QRS/T y vectores de lesión en los planos frontal y horizontal.

## Testing

- Unitarios (Vitest): store, medición, reglas (positivo/negativo), quiz metrics, labels.
- Propiedades (fast-check) donde aplica en engine/math.
- Aceptación por caso (§9.12): cada caso genera su ECG en `ecgAtMin` y sus hallazgos
  esperados se verifican contra el motor de reglas.
- Aceptación del motor (§9): territorios, amplitudes, ritmos, adquisición.

## Determinismo

Mismo `Scenario` + misma `seed` ⇒ misma señal. El PRNG (mulberry32) cubre schedule de
latidos, ruido y — en un stream independiente (`seed·2654435761`) — el jitter por paciente
(`variability`), que puede desactivarse con `variability: false` (así lo lleva
`defaultScenario` para los tests de aceptación).
