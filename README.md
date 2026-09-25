# ECG Lab — Simulador clínico de ECG

Simulador web de ECG de 12 derivaciones para docencia y entrenamiento diagnóstico.
Un motor vectorial 3D genera latidos fisiológicos —ritmos, bloqueos, ectopía, marcapasos,
electrolitos— y una capa de análisis delineada mide la señal y aplica reglas diagnósticas
cuantitativas reales. El módulo de isquemia (**OMI Lab**) añade lesión coronaria aguda
direccionada con evolución temporal.

## Qué incluye

- **Motor vectorial 3D** → proyección a 12+ derivaciones (V7–V9, V3R–V4R) vía matriz tipo Dower.
- **103 casos clínicos** en 14 series y 9 categorías: oclusión (A–F), ritmo (G), ectopía (H),
  bloqueo AV (I), conducción intraventricular (J), ventricular/paro (K), marcapasos (L),
  electrolitos/fármacos/QT (M) y estructural/otros (N).
- **Ritmos**: sinusal, FA, flutter (fijo/variable), TSV, unión, ectopía auricular y
  ventricular, bigeminismo/trigeminismo, TV, torsades, FV, asistolia, marcapasos AAI/VVI/DDD.
- **Conducción**: BRD (e incompleto), BRI, hemibloqueos, bifascicular, WPW, dextrocardia.
- **Electrolitos**: hiper/hipopotasemia, hiper/hipocalcemia, efecto digitálico, QT largo/corto,
  onda de Osborn, patrón Brugada tipo 1.
- **Reglas cuantitativas**: 14 reglas STEMI/OMI (stemi-udmi4, de Winter, T hiperaguda, STD
  posterior, Aslanger, bandera sudafricana, aVR difuso, VD, Sgarbossa original/modificado,
  BARCELONA, Smith 3v/4v, distorsión terminal, Wellens, Q patológica) + 16 reglas generales
  (FC, regularidad, PR, QRS ancho, morfología de rama, QTc, ejes, HV, bajo voltaje, T picuda,
  onda U, disociación AV, flutter, marcapasos).
- **Delineación honesta**: pipeline independiente de muestras (sin trampas del generador)
  con auditoría contra la verdad del motor; cada métrica lleva evidencia
  (usable / revisión / no disponible) y se retira si se desvía de los fiduciales.
- **Monitor** de barrido en tiempo real con FC numérica, congelado y bip opcional.
- **Laboratorio**: editor completo del escenario (ritmo, conducción, isquemia, repolarización,
  adquisición) con presets y sliders.
- **Quiz**: decisión OMI para casos de isquemia y diagnóstico de 4 opciones para el resto.
- **Persistencia**: estado en la URL (`?s=`), JSON de escenario, casos guardados en
  `localStorage`, PNG a 300 dpi con chunk pHYs y pie "Simulación educativa".

## Inicio rápido

```bash
nvm use            # Node 22 (.nvmrc)
npm ci
npm run dev        # http://localhost:5173
npm run check      # format + lint + typecheck + tests + build
```

## Arquitectura

```
src/engine       Simulación: schedule → dipolo del latido → derivaciones → adquisición
src/analysis     Delineación de muestras → auditoría contra fiduciales → reglas → informe
src/cases        Biblioteca de 103 casos (A–N) con viñetas, expectativas y referencias
src/ui           Vanilla TS + Canvas 2D: shell, renderer, monitor, paneles, modos
src/persistence  Estado en URL, JSON de escenario, casos guardados
tools            CLI de inspección (dump-beat, dump-cases)
docs             MODEL.md · CASES.md · ARCHITECTURE.md · research/ (revisión científica)
```

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/MODEL.md](docs/MODEL.md),
[docs/CASES.md](docs/CASES.md) y la revisión en [docs/research/revision-ecg-sca.md](docs/research/revision-ecg-sca.md).

## Atajos de teclado

| Tecla             | Acción                                    |
| ----------------- | ----------------------------------------- |
| `Espacio`         | Reproducir / pausar la evolución temporal |
| `←` / `→`         | t −1 / +1 minuto                          |
| `Shift` + `←`/`→` | t −10 / +10 minutos                       |
| `c`               | Alternar traza limpia (verdad)            |
| `[` / `]`         | Caso anterior / siguiente                 |
| `Esc`             | Limpiar calipers / cerrar menús           |

## Calidad

TypeScript estricto (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESLint 9,
Prettier, Vitest (+ fast-check en propiedades), tests de aceptación por caso y por regla,
CI en GitHub Actions y despliegue estático en Pages.

## Limitaciones y honestidad

Herramienta **educativa**: no es un dispositivo médico. Las señales son sintéticas (dipolo
de corazón único); la delineación puede fallar en trazados extremos y entonces la métrica
se marca como _revisión_ o _no disponible_ en lugar de mostrarse como válida — la auditoría
compara cada métrica con los fiduciales del generador y la retira si se desvía más allá de
las tolerancias (FC 5 %, PR 25 ms, QRS 20 ms, QT 40 ms, eje 25°). Las reglas solo están
validadas en sus poblaciones originales. No usar para decisiones clínicas.

Las reglas diagnósticas (OMI/ST y generales) se alimentan de **mediciones ciegas**:
el pipeline `samples → delineate → measureFromDelineation → rules` nunca toca los
fiduciales del generador. La medición fiducial (`measureEcg`) sobrevive solo como
referencia de auditoría: `measurementAudit` compara ST y amplitud T por derivación y
reporta discordancias (usable / revisión / no disponible) sin alterar los hallazgos.

## Licencia

MIT — ver [LICENSE](LICENSE).
