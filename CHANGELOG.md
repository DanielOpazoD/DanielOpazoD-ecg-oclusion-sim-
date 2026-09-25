# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Accesibilidad y teclado**: roving tabindex en pestañas (modo y panel), «?» abre la
  ayuda con trampa de foco y Escape, menú de exportación navegable con flechas,
  `aria-expanded` en hallazgos, `aria-current` solo en el caso activo, skip link,
  `role="img"` + `aria-label` dinámico en el canvas, región live con el veredicto,
  `.sr-only`, breakpoint `prefers-contrast: more`.

### Changed

- **Tema claro único**: papel ECG clásico rojo pálido sobre blanco cálido; se retira el
  modo oscuro (pantalla del monitor conserva metáfora de dispositivo oscuro).
- **Responsive**: breakpoints a 1280 / 1100 / 900 / 600 px (apilado de paneles, chips
  envolventes, tarjetas 33 %/50 %, monitor 90 px); `ResizeObserver` re-renderiza el
  canvas al cambiar el layout.

### Fixed

- **Buscador de casos**: la cabecera del explorador es persistente y solo se re-renderiza
  la lista — el input ya no pierde el foco al teclear; preservación genérica de foco y
  selección en re-renders (`withFocusPreserved`).

### Added

- **Análisis 100 % ciego**: las reglas OMI/ST leen `measureFromDelineation` — mediciones
  construidas solo de las muestras y la delineación independiente. `measureSignal` acepta
  fiduciales arbitrarios (`BeatFiducials[]`); `measureEcg` queda como referencia de
  auditoría. `auditMeasurements` reporta leads discordantes (|ΔstJ| > 0.05 mV, |ΔtAmp| >
  0.1 mV o cambio de signo) con estado usable/revisión/no disponible, expuesto en
  `AnalysisReport.measurementAudit` y `reference`. Auditoría de eje QRS: se retira si
  discrepa > 25° de la referencia. La UI muestra la insignia «Medido en señal (ciego)» y
  la nota de auditoría cuando el estado no es usable.

### Changed

- **Delineador**: cruce de fin de QRS por suelo de plateau (min magnitud ×1.08), segunda
  oportunidad de búsqueda de P hasta 30 ms antes del onset (PR cortos/WPW), realineación
  por correlación de segmentos en el latido promedio, amplitudes R/S/T por latido sobre
  señal cruda (robustas a jitter y alternans), refinamiento del punto J por derivación
  con prueba de pendiente y estabilidad de nivel.

### Fixed

- Umbrales de J tardío/sistemáticamente temprano en la delineación que provocaban
  falsos negativos de STE y falsos positivos de STD/Sgarbossa; extrasístoles excluidos
  de la medición; FV excluida por decorrelación de latidos en ritmo caótico.

## [2.0.0] - 2026

### Added

- **Engine**: schedule de eventos atriales/ventriculares con memoria QT, ESV/ESA con reset
  sinusal, bloqueos AV (Mobitz I/II, 2:1, alto grado, completo con escape), FA con suelo
  refractario 260 ms, flutter fijo/variable, TSV, ritmo de la unión, bigeminismo/trigeminismo,
  dupla, TV, torsades, FV, asistolia, marcapasos AAI/VVI/DDD con spikes suprimibles,
  WPW/hemibloqueos/bifascicular, electrolitos (K, Ca), efecto digitálico, QT largo/corto,
  Osborn, Brugada tipo 1, dextrocardia, alternans, `ModelScopeError`.
- **Analysis**: delineación independiente de muestras (picos, bordes QRS por energía de
  pendiente, P multiderivación polaridad-agnóstica, T-end por tangente, autocorrelación
  auricular, ejes por área integrada), auditoría contra fiduciales con retirada de métricas,
  evidencia usable/revisión/no disponible, `qrsContext` (narrow/rbbb/lbbb/paced/ventricular),
  gating `notApplicable` de las 14 reglas OMI, 16 reglas generales clínicas.
- **Cases**: 53 casos nuevos (grupos G–N, total 103), campos `category`, `diagnosis` y
  `distractors` para quiz, bibliografía unificada 1–128.
- **UI**: shell ECG Lab con modos Casos/Laboratorio/Monitor/Quiz, renderer min/max con
  Cabrera, secuencial/simultáneo, tiras 10/30/60 s, tarjetas de métricas con insignias de
  evidencia, monitor de barrido con FC y bip, detalle de latido con fiduciales, quiz por
  diagnóstico para casos no isquémicos.
- **Persistence**: estado en URL `?s=`, importar/exportar escenario JSON, casos guardados en
  `localStorage`, PNG 300 dpi con pHYs.

### Changed

- Producto renombrado a **ECG Lab**; OMI Lab es el módulo de isquemia.
- ST discordante de BRI/marcapasos calibrado al 5 % de la S (no satisface Sgarbossa sin
  lesión); eje QRS delineado por área integrada; evidencia de PR en tres niveles con veto
  en contexto ventricular; regularidad por CV/autocorrelación con 'irregular organizado'.
- `beats[].kind` con tipos de evento (`sinus`, `pvc`, `paced`, `conducted`…); `Ecg12` lleva
  `schedule`, `beats` fiduciales y spikes.

### Fixed

- AF rápida ya no lanza `qrs-overlap` (suelo RR 260 ms); onda U requiere `uAmp ≥ 35 %·tAmp`;
  detección de P bajo STE/T hiperaguda; eje QRS estable en FA rápida; PR nunca 'usable' en
  ritmo ventricular; `heart-rate`/`bundle-branch-morphology` con etiquetas negativas neutras;
  dropdown de exportación cerrado por defecto; modo Monitor renderiza y oculta toolbar/
  timeline; riel de laboratorio sin scroll horizontal; línea de tiempo oculta sin isquemia;
  quiz itera el conjunto filtrado; subetiqueta FC solo cuando la FC auricular aporta.

## [0.1.0] - 2026

### Added

- **Motor ECG vectorial 3D**: dipolo del latido (P, QRS multi-componente, ST-T Hermite),
  proyección a 12+ derivaciones (V7–V9, V3R–V4R), lesión isquémica direccionada con
  morfologías de ST, T hiperaguda, inversión de T, necrosis (onda Q) y distorsión terminal.
- **Ritmos y conducción**: sinusal, bradicardia, BAV 1º/2º Mobitz I/3º, RIVA, PVC, FA, TSV,
  marcapasos; BRI, BRD, HVI con strain, WPW.
- **Evolución temporal**: timeline con oclusión, reperfusión y reoclusión por fuente.
- **Adquisición realista**: wander, EMG, red 50/60 Hz, movimiento, filtros HP/LP y errores
  de colocación de electrodos.
- **Capa de análisis**: medición del latido dominante (ST J/J+60, R, S, T, ejes, QT/QTc) y
  18 reglas diagnósticas STEMI/OMI con justificación y referencias.
- **Biblioteca de 50 casos** en 6 series con viñetas, expectativas, angiografía, puntos
  docentes, trampas y referencias bibliográficas.
- **UI completa**: modo Casos (con modo ciego + revelación por caso), Laboratorio (editor
  de escenario), Quiz secuencial con sensibilidad/especificidad, renderer de papel ECG con
  calipers, monitor de barrido, vista vectorial, exportación PNG e informe.
- **Variabilidad interindividual** determinista por semilla (`scenario.variability`).

### Documentación

- docs/MODEL.md — especificación del motor y las reglas.
- docs/CASES.md — especificación de la biblioteca de casos.
- docs/research/revision-ecg-sca.md — revisión científica con 106 referencias.
- docs/ARCHITECTURE.md — flujo de datos y decisiones de diseño.
