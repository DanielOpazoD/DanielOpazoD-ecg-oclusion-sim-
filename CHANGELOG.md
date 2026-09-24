# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
