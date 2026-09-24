# Modelo de señal — especificación del motor

Este documento define el modelo físico/matemático del generador de ECG de 12 derivaciones
y los contratos de sus módulos. Es la fuente de verdad para `src/engine/**`. Toda decisión
tiene su justificación en `docs/research/revision-ecg-sca.md` (sección 6 y especificaciones S1–S10);
los números entre corchetes remiten a la bibliografía de esa revisión.

## 0. Principios

1. **Un solo dipolo cardíaco variable en el tiempo** `H(t) ∈ ℝ³` genera las 12 derivaciones por
   proyección lineal: `V_L(t) = ℓ_L · H(t)`. La coherencia entre derivaciones (Einthoven,
   reciprocidad, ST recíproco) emerge de la física, nunca se "pinta" derivación a derivación.
2. **La isquemia es un vector de lesión** que se **suma** al dipolo normal durante ST‑T (y resta
   fuerzas durante el QRS cuando hay necrosis). Elevación vs depresión del ST es solo el signo
   de la proyección `ℓ_L · d_ST`.
3. **Determinismo**: mismo `Scenario` + misma semilla ⇒ misma señal (PRNG propio, `seed`).
4. **Unidades SI clínicas**: amplitud en **mV**, tiempo en **ms** en parámetros; señal muestreada a
   `fs = 500 Hz` (configurable) en **mV**.
5. **Sin dependencias de UI en el motor**: `src/engine` y `src/analysis` son TypeScript puro,
   testeables en Node.

## 1. Sistema de coordenadas y derivaciones

Espacio de Frank con convención **Dower**: `X` = hacia la izquierda del paciente, `Y` = hacia
los pies (inferior), `Z` = hacia la **espalda** (posterior). Un vector que apunta al ápex/pared
anterior tiene `Z < 0`.

Matriz de Dower (Dower 1980 [83], coeficientes X, Y, Z):

| Derivación | X | Y | Z |
|---|---|---|---|
| I | 0.632 | −0.235 | 0.059 |
| II | 0.235 | 1.066 | −0.132 |
| V1 | −0.515 | 0.157 | −0.917 |
| V2 | 0.044 | 0.164 | −1.387 |
| V3 | 0.882 | 0.098 | −1.277 |
| V4 | 1.213 | 0.127 | −0.601 |
| V5 | 1.125 | 0.127 | −0.086 |
| V6 | 0.831 | 0.076 | 0.230 |

Derivadas: `III = II − I`, `aVR = −(I + II)/2`, `aVL = I − II/2`, `aVF = II − I/2`.

Derivaciones adicionales (vectores aproximados; V7–V9 escalados ×0.6 respecto al
módulo de V6 porque las R posteriores reales son pequeñas):

| Derivación | X | Y | Z | Uso |
|---|---|---|---|---|
| V7 | 0.27 | 0.06 | 0.45 | posterior |
| V8 | 0.06 | 0.06 | 0.54 | posterior |
| V9 | −0.15 | 0.06 | 0.51 | posterior |
| V3R | −0.75 | 0.10 | −0.60 | VD |
| V4R | −0.95 | 0.15 | −0.35 | VD |

La matriz debe ser **parametrizable** (`LeadSystem`) para simular mala colocación (ver §7).

## 2. Latido base: trayectoria del dipolo

Cada latido se construye en 3D como suma de componentes con envolventes suaves. Tiempo local
`τ` en ms desde el inicio del QRS (`τ = 0` = onset QRS).

### 2.1 Onda P
Gaussiana 3D: `P(τ) = a_P · g(τ; μ = −PR + 55, σ = 22) · û_P`, con `û_P ≈ norm(0.35, 0.85, −0.15)`
(eje +60°, ligeramente anterior), `a_P` calibrado para 0.10–0.15 mV en II. Duración ≈ 90–110 ms.

### 2.2 QRS
Tres gaussianas 3D (septal, pared libre, basal) — modelo McSharry extendido a 3D [78,80]:

| Componente | μ (ms) | σ (ms) | dirección (X,Y,Z) | ganancia relativa |
|---|---|---|---|---|
| septal | 12 | 7 | norm(−0.55, 0.15, −0.60) | 0.22 |
| pared libre | 40 | 12 | norm(0.72, 0.62, 0.30) | 1.00 |
| basal | 70 | 6 | norm(−0.30, −0.45, 0.65) | 0.28 |

(σ basal 6 ms, no 8: con σ 8 la cola basal supera el punto J ~0.03 mV y rompe la
isoeléctrica del ST.)

La ganancia global `a_QRS` se **calibra por test** para cumplir en el latido normal:
`R(V5) ∈ [1.0, 2.2] mV`, `r(V1) < 0.5 mV`, `S(V1) ∈ [0.5, 1.6] mV`, `R(II) ∈ [0.6, 1.5] mV`,
progresión R V1→V5 monótona, transición en V3–V4, QRS 80–100 ms, eje frontal 30–75°.

### 2.3 Repolarización (ST‑T) mediante puntos de control
La ST‑T se describe en 3D con una **spline Hermite cúbica monótona** por puntos de control
en el tiempo; cada punto es un vector 3D. Puntos base (latido normal), relativos al **punto J**
(`τ_J ≈ 90 ms`):

| Punto | τ (ms desde J) | vector normal |
|---|---|---|
| J | 0 | 0 |
| J+40 | 40 | 0.02·û_T |
| ST‑T junction | 110 | 0.10·û_T |
| T pico | 220 | a_T·û_T |
| T fin | 340 | 0 |

`û_T = norm(0.65, 0.45, −0.40)` (concordante con QRS, anterior; con (0.70,0.45,−0.25)
no se cumplen a la vez `T(V5) ≤ 0.6` y `T(V2) ≥ 0.3`). `a_T = 0.50` calibrado para
`T(V5) ∈ [0.25, 0.6] mV`, `T(V2) ∈ [0.3, 0.9]`, T negativa en aVR, T(V1) ∈ [−0.2, 0.2].
Los tiempos se escalan con la **QT** deseada: `QT = k·√RR` (Bazett inverso), QTc objetivo 400 ms.

## 3. Lesión (isquemia transmural / subendocárdica)

### 3.1 Vector de lesión
Un `InjurySource` es `{ direction: Vec3 (unitario), st: number (mV), profile: 'transmural' | 'subendocardial', shape, hyperacuteT, tInversion, qLoss, terminalDistortion, tGain? }`.

- **Transmural**: `d_ST` apunta desde el centro ventricular hacia el **epicardio de la pared**
  afectada. Se suma a los puntos de control ST‑T: `J += st·s_J·d`, `J+40 += st·s_40·d`,
  `junction += st·s_jn·d`, `Tpico += (st·s_T + hyperacuteT·a_T)·d`.
- **Subendocárdica** (demanda): `d_ST` apunta hacia la **cavidad** (desde epicardio a
  endocardio): `d = norm(−0.60, −0.55, 0.45)` (posterior‑superior‑derecho) ⇒ STD en I, II,
  V4–V6 y STE en aVR. No localiza [1,19,20].

Múltiples fuentes se **superponen** (S3): multivaso, DA envolvente, Aslanger.

### 3.2 Morfología del ST (`shape`)
Coeficientes (`s_J, s_40, s_jn, s_T`) por forma:

| shape | s_J | s_40 | s_jn | s_T | uso clínico |
|---|---|---|---|---|---|
| `concave` | 0.6 | 0.8 | 1.0 | 0.6 | STE precoz, RP, pericarditis |
| `straight` | 0.9 | 1.0 | 1.0 | 0.5 | STE típica |
| `convex` | 1.0 | 1.15 | 1.0 | 0.3 | STE "coved", DA proximal |
| `tombstone` | 1.3 | 1.25 | 1.0 | 0.0 | fusión ST‑T, J/R ≥ 0.5 |
| `depression-upsloping` | 0.6 | 1.0 | 0.9 | −1.6 | De Winter (con `st < 0` y T alta) |

`st` es la **magnitud pre‑shape del vector de lesión** expresada en la derivación de
referencia (`refLead`): el motor escala `d` para que `ℓ_refLead · stVector = st` mV.
La elevación resultante en J en `refLead` es `ST_J = st·s_J` (p. ej. `straight` ⇒ 0.9·st).
`tGain` (opcional, por defecto `shape.s_T`; el territorio `posterior` usa 0.05) es la
ganancia del vector de lesión en el punto T‑pico, desacoplada de la morfología del ST.

### 3.3 T hiperaguda
`hyperacuteT ∈ [0, 2.5]` añade `0.5·hyperacuteT·a_T·d` al punto T pico (coeficiente
0.5 calibrado para tamaños de T clínicos) y **ensancha** la T estirando el eje temporal
tras el junction ×(1 + 0.25·hyperacuteT) — implementación equivalente a σ efectivo mayor,
que además recentra el pico y la hace **simétrica**. Objetivo:
área T/QRS ↑ ≥ 2× respecto al basal en derivaciones que miran la lesión [26,27].

### 3.4 Necrosis (onda Q) y distorsión terminal
- `qLoss ∈ [0, 1]`: resta fuerzas iniciales en dirección `d`: añade una gaussiana
  `−qLoss·0.9·a_QRS·g(τ; 18, 9)·d` (Q patológica ≥ 40 ms / ≥ 25 % R en derivaciones que miran
  la lesión) y atenúa la pared libre en la misma dirección (`R` pierde amplitud).
- `terminalDistortion ∈ [0, 1]`: el vector de lesión empieza a sumarse desde `τ = 60 ms`
  con rampa, elevando el punto J respecto a R (J/R ≥ 0.5 en qR; pérdida de S en RS) [68,69].

### 3.5 Inversión de T
`tInversion ∈ [0, 1]` desplaza el vector de T pico: `Tpico = a_T·û_T·(1 − tInversion) − tInversion·a_T·1.2·d`.
Con `tInversion` intermedio y `st ≈ 0` se obtiene Wellens A (bifásica: se añade un punto de control
positivo en `junction` y negativo en `Tpico`); con `tInversion → 1` Wellens B (profunda, simétrica).

## 4. Territorios y arterias

`Territory` define `direction` (para transmural), derivaciones "que miran", arteria(s) típica(s):

| id | direction (X,Y,Z) | miran | arteria |
|---|---|---|---|
| `anteroseptal` | norm(−0.10, −0.30, −0.93) | V1–V4, aVR | DA proximal (pre‑S1) |
| `anterior` | norm(0.30, 0.20, −0.90) | V2–V5 | DA media |
| `anteroapical` | norm(0.55, 0.45, −0.65) | V3–V6, II | DA distal |
| `high-lateral` | norm(0.80, −0.50, −0.25) | I, aVL, V2 | D1 / OM alta (South African flag) |
| `lateral` | norm(0.90, 0.20, 0.30) | I, aVL, V5–V6 | CX / OM |
| `inferior-rca` | norm(−0.15, 0.95, 0.10) | II, III (>II), aVF | CD |
| `inferior-lcx` | norm(0.75, 0.55, 0.35) | II (≥III), aVF, V5–V6 | CX |
| `posterior` | norm(0.30, 0.20, 0.93) | V7–V9; STD V1–V3 | CX / CD‑DP |
| `rv` | norm(−0.70, 0.40, −0.55) | V1, V3R–V4R, III | CD proximal |
| `subendocardial` | norm(−0.60, −0.55, 0.45) (profile subendocardial) | STD difusa, STE aVR | demanda / TCI / 3 vasos |

Los vectores se **ajustan por test** hasta que cada territorio cumple su patrón esperado (ver §9).
Ajustes ya calibrados: `anteroseptal` con Y −0.30 (genera STD inferior recíproca),
`inferior-rca` con Z 0.10 (ST V1 ≥ 0), `inferior-lcx` rotada a +X (aVL ≈ isoeléctrica).
`posterior` lleva `tGain = 0.05` (STD V1–V3 con T terminal positiva, no invertida).

## 5. Ritmo y conducción

### 5.1 Ritmo (`RhythmSpec`)
- `sinus`: HR (bpm) + HRV: modulación respiratoria `RR·(1 + 0.03·sin(2π·0.25·t))` + ruido
  gaussiano σ = 1.5 % RR.
- `sinus-bradycardia` (HR < 60) — frecuente en CD.
- `av-block-1` (PR 220–320 ms), `av-block-2-mobitz1` (Wenckebach 3:2 / 4:3), `av-block-3`
  (P disociada 70–90 bpm; escape unión 40–55 bpm QRS estrecho o ventricular 30–40 bpm ancho).
- `aivr` (QRS ancho 60–110 bpm, disociación AV; marcador de reperfusión [74]).
- `pvc` (extrasístoles: tasa por minuto, acoplamiento 450–600 ms, QRS ancho, pausa compensadora).
- `afib` (RR irregular: RR = 60000/HR·(0.65 + 0.7·U), sin P, ondulación f 5–8 Hz 0.03 mV).

### 5.2 Conducción (`ConductionSpec`)
- `normal`.
- `lbbb`: QRS 140–160 ms; componente septal invertida (hacia la izquierda), pared libre
  retrasada (μ 60, σ 22) y basal amplia; **ST‑T discordante** (`û_T := −û_QRS_dominante`) con
  ST discordante proporcional (≈ 0.10–0.15 × S). La lesión se suma encima ⇒ concordancia
  o discordancia excesiva (Sgarbossa/BARCELONA) [61,62,63].
- `rbbb`: componente terminal lenta hacia derecha‑anterior (μ 85, σ 18, dir norm(−0.8, 0.1, −0.55)),
  QRS 120–140 ms, T discordante solo en V1–V2.
- `paced`: espiga (2 ms, 0.5–2 mV, dir arbitraria) + morfología tipo LBBB con eje superior.
- `lvh`: pared libre ×1.8; `lvh-strain`: además T discordante asimétrica lateral [16].
- `wpw`: componente inicial lenta (onda delta, μ 8, σ 18) + PR corto (~90 ms) [82].
- Hiperpotasemia: no es un `ConductionSpec`; se modela con `BeatOverrides`
  (`aTScale`, `tSigmaScale`, helper `hyperkalemiaOverrides()`) [77].

Extrasístoles/AIVR (`pvc`, `aivr`, `escape` ancho): un único componente ventricular
ancho (μ 55, σ 25) en la dirección de origen `ventricularOrigin`. Marcapasos incluye
espiga de 2 ms (~1.2 mV) antes del QRS. En `av-block-3` los eventos llevan
`prMs = −1` (P disociada), en `svt`/`aivr`/`pvc`/`afib` no hay P precedente.

## 6. Evolución temporal (`Timeline`)

`Scenario.timeline` es una lista de eventos `{ atMin, kind: 'occlusion' | 'reperfusion' | 'reocclusion' }`
por fuente. El motor evalúa `t` (min) y devuelve los parámetros efectivos de cada fuente:

**Oclusión persistente (desde t₀)** — valores relativos al `st` nominal `S` y `hyperacuteT` nominal `H`:

| Parámetro | fórmula |
|---|---|
| hyperacuteT(t) | `H·ramp(t, 1, 8)·(1 − 0.6·ramp(t, 45, 180))` |
| st(t) | `S·ramp(t, 3, 25)·(1 − 0.35·ramp(t, 360, 1440))` |
| qLoss(t) | `ramp(t, 90, 600)` (Q empieza ~1.5–2 h, completa a 10 h) [22,23] |
| tInversion(t) | `ramp(t, 720, 2160)` (inversión 12–36 h en no reperfundido) |

`ramp(t, a, b) = clamp((t − a)/(b − a), 0, 1)` suavizada (smoothstep).

**Reperfusión en t_R** (`reperfusion`): a partir de t_R,
`st(t) = st(t_R)·exp(−(t − t_R)/τ_R)` con `τ_R = 45 min` (≥ 50 % de resolución a 60–90 min [71,72]);
`hyperacuteT → 0` en 15 min; `tInversion(t) = ramp(t − t_R, 30, 720)` (T de reperfusión/Wellens);
`qLoss` se congela en `qLoss(t_R)`. Opcional `aivr` en ventana t_R + 0–30 min.

**Reoclusión en t_O** (`reocclusion`): `tInversion` cae a 0 en 5 min (**pseudonormalización**),
luego `hyperacuteT` y `st` suben con las rampas de oclusión desplazadas a t_O.

## 7. Adquisición: ruido, filtros y colocación (`AcquisitionSpec`)

- `baselineWander`: seno 0.15–0.35 Hz, amplitud 0–0.3 mV (respiración) + deriva lenta.
- `emg`: ruido blanco gaussiano filtrado 20–100 Hz, σ 0–0.05 mV.
- `powerline`: 50 o 60 Hz, 0–0.1 mV.
- `motion`: transitorios exponenciales aleatorios (0–2/min, 0.2–1 mV, τ 150 ms).
- `highPassHz`: 0.05 (diagnóstico, por defecto) | 0.5 (monitor; distorsiona el ST ⇒ pseudo‑depresión
  tras R alta) — IIR de 1er orden bidireccional o unidireccional según `mode`.
- `lowPassHz`: 150 (diagnóstico) | 40 (monitor; reduce espigas, notch, amplitud R).
- `placement`: `'standard' | 'la-ra-swap' | 'la-ll-swap' | 'v1v2-high' | 'precordial-lateral-shift'`.
  Intercambios de miembros se implementan **recombinando** las derivaciones (I → −I, II↔III,
  aVR↔aVL para LA‑RA). `v1v2-high`: los vectores de V1/V2 rotan hacia superior‑posterior
  (Y −0.35, Z +0.25) ⇒ rSr′ y T negativa V1–V2 (mimic de Brugada/IAM anteroseptal).
  `precordial-lateral-shift`: V1–V5 se interpolan 50 % hacia la derivación siguiente
  (desplazamiento de una posición hacia lateral; la clínica no cuantifica el vector).
  `placement` vive dentro de `acquisition` en `Scenario`.

Orden de operaciones: dipolo → proyección con `LeadSystem` (colocación) → suma de ruido →
filtros. La señal "verdad" (sin ruido ni filtros) queda disponible para el análisis y para el modo
docente "quitar ruido".

## 8. Análisis (`src/analysis`)

Nota de implementación: `Scenario.timeline` eventos llevan `sourceId` (id o índice de
fuente; `undefined` = todas). `Scenario` incluye `beatOverrides` (`aTScale`, `tSigmaScale`,
`qtc`, `prDepressionMv`, `jNotchMv`, `osbornMv`, `rScale`).

Entrada: `Ecg12` (matriz `leads × samples`, `fs`, fiduciales por latido: onset P, onset QRS, J,
fin T — **generados por el motor**, no detectados). Se promedia el latido sinusal dominante por
derivación (mediana temporal, excluyendo extrasístoles) y se mide:

- Línea de base: media del segmento **PR** (`onsetQRS − 60 ms … onsetQRS − 20 ms`) [1].
- `stJ`, `st60`, `st80` (mV) respecto a la base; `stSlope` (mV/s).
- `qDur`, `qAmp`, `rAmp`, `sAmp`, `qrsDur`, `jToR = stJ / rAmp`.
- `tAmp`, `tArea` (área ∫ desde junction a fin de T), `tSym` (ratio pendiente ascendente/descendente),
  `tQrsAreaRatio` (área T / área |QRS|), `tWidth50` (anchura a mitad de amplitud).
- `qt`, `qtcBazett`, `pr`, `hr`, `axis` frontal (QRS y T).

Reglas (`rules/*.ts`), cada una devuelve `Finding { id, label, positive, score?, leads, values, rationale, refs }`:

| id | regla | ref |
|---|---|---|
| `stemi-udmi4` | STE en J en 2 contiguas: V2–V3 ≥ 2.0 mm (H ≥ 40), 2.5 (H < 40), 1.5 (M); otras ≥ 1.0 mm; V7–V9 ≥ 0.5; V3R–V4R ≥ 0.5 (1.0 en H < 30) | [1] |
| `posterior-std` | STD máxima en V1–V4 (≥ 0.5 mm) con T terminal positiva, sin STE anterior | [46,47] |
| `de-winter` | STD ascendente ≥ 1 mm en J en ≥ 2 de V2–V5 + T alta simétrica; STE aVR 0.5–1 mm | [36,37] |
| `hyperacute-t` | score medio ≥ 0.7 en 2 contiguas (área T/QRS y simetría normalizados) | [27] |
| `aslanger` | STE III sin II/aVF, STD en ≥ 1 de V4–V6 con T positiva/terminal positiva, ST V1 > ST V2 | [45] |
| `rv-involvement` | STE V4R ≥ 1 mm (o V1 con STE III > II) en IAM inferior | [48,49] |
| `avr-diffuse-std` | STD ≥ 1 mm en ≥ 6 derivaciones + STE aVR ≥ 1 mm | [51,52] |
| `south-african-flag` | STE I, aVL, V2 + STD III | [55] |
| `reciprocal-avl` | STE inferior + STD aVL ≥ 0.5 mm | [70] |
| `sgarbossa` / `sgarbossa-modified` / `barcelona` | en LBBB/paced: concordante ≥ 1, STD V1–V3 ≥ 1, discordante ≥ 5; ST/S ≤ −0.25; BARCELONA: concordante ≥ 1 o discordante ≥ 1 con |QRS| ≤ 6 mm | [61,62,63] |
| `smith-3v` / `smith-4v` | fórmulas con umbrales 23.4 / 18.2 | [66,67] |
| `terminal-qrs-distortion` | J/R ≥ 0.5 en qR o pérdida de S en RS en V2–V3 | [68] |
| `wellens` | T bifásica (A) o profunda simétrica (B) en V2–V4 sin STE, con QRS estrecho | [38,39] |
| `pathological-q` | Q ≥ 40 ms o ≥ 25 % R en 2 contiguas | [1] |
| `omi-composite` | positivo si `stemi-udmi4` o cualquiera de: de‑winter, hyperacute‑t, posterior‑std, aslanger, sgarbossa‑modified, barcelona, smith‑4v ≥ 18.2, south‑african‑flag, terminal‑qrs‑distortion + STE sutil | [5,6,9] |

Todas las reglas tienen tests con casos positivos y negativos construidos con el propio motor.

## 9. Criterios de aceptación del motor (tests)

1. **Einthoven/Goldberger**: `I + III = II`, `aVR + aVL + aVF = 0` con error < 1e‑9 mV.
2. **Latido normal** cumple los rangos de §2.2–§2.3.
3. Cada `Territory` con `st = 2 mV en refLead`, `shape = straight` produce: STE > 1 mm en sus
   derivaciones "que miran" (≥ 0.5 mm en V7–V9, que llevan ganancia reducida), STD recíproca
   en las opuestas (inferior‑CD ⇒ aVL < −0.5 mm;
   anteroseptal ⇒ STD en II/III/aVF; posterior ⇒ STD V1–V3 con STE V7–V9 y T terminal
   positiva en V2).
4. `inferior-rca`: `ST(III) > ST(II)`, `ST(V1) ≥ 0`. `inferior-lcx`: `ST(II) ≥ ST(III)`, `ST(aVL) ≥ −0.5 mm`.
5. `subendocardial` con `st = 1.5`: STD ≥ 1 mm en ≥ 6 derivaciones y STE aVR ≥ 1 mm ⇒ `avr-diffuse-std` positivo; `stemi-udmi4` negativo.
6. Timeline: a t = 5 min `hyperacute-t` positivo y `stemi-udmi4` negativo; a t = 45 min `stemi-udmi4` positivo; tras reperfusión a t_R + 90 min STE < 50 % del máximo; a t_R + 24 h `wellens` o inversión de T presente; reoclusión ⇒ T positiva de nuevo (pseudonormalización) en ≤ 10 min.
7. `lbbb` sin lesión: `sgarbossa-modified` y `barcelona` negativos; con `anteroseptal st = 1.5` concordante ⇒ positivos.
8. `de-winter` escenario (anterior `depression-upsloping`, `st = −1.5`, `hyperacuteT = 1.5`) ⇒ regla positiva; `stemi-udmi4` negativa.
9. Filtro HP 0.5 Hz unidireccional produce |ΔST| > 0.05 mV respecto a 0.05 Hz en un latido con R alta.
10. `la-ra-swap`: `I` invertida respecto a estándar, `aVR` ≈ `aVL` estándar.
11. Determinismo: dos generaciones con la misma semilla son idénticas (`toEqual`).
12. Todos los casos de la biblioteca: `expected.omi === rules.omiComposite.positive` **o** el caso
    declara explícitamente `expected.rulesMiss = true` (OMI que las reglas no detectan; se documenta
    el porqué en el caso). Cada caso enumera los `findings` esperados positivos y negativos.
