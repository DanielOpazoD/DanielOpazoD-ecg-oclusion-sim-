# Biblioteca de casos — especificación clínica

Fuente de verdad para `src/cases/*.ts`. Cada caso se define por un `Scenario` (ver `docs/MODEL.md`)
y un bloque clínico. Las viñetas son ficticias pero clínicamente coherentes; las cifras de troponina
son hs‑cTnT (ng/L, p99 = 14). Refs = numeración de `docs/research/revision-ecg-sca.md`.

Convenciones de la tabla `Scenario`: `terr(st mm @ref, shape, hT=hyperacuteT)`; `t` = minutos desde
el inicio de la oclusión en el momento del ECG; `rep@x` = reperfusión a los x min; `reocc@x`.
Si no se indica: ritmo sinusal 60–95 lpm, conducción normal, adquisición diagnóstica limpia (ruido leve).

## A. Oclusión evidente (STEMI+)

| id | título | viñeta | scenario | esperado | angiografía | refs |
|---|---|---|---|---|---|---|
| A01 | DA proximal clásica | H 58 a, dolor opresivo 40 min, diaforesis | anteroseptal(3.5@V2, convex, hT 0.8), t 40 | OMI ✔, stemi ✔, reciprocal inferior STD | DA prox TIMI 0 | 1,56 |
| A02 | DA media | M 66 a, dolor 2 h, disnea | anterior(2.5@V3, straight), t 120, qLoss según timeline | OMI ✔, stemi ✔ | DA media TIMI 0 | 1 |
| A03 | CD con BAV completo | H 71 a, síncope, hipotensión | inferior-rca(3@III, straight) + rv(1.5@V4R), ritmo av-block-3 (escape 38 lpm), t 90 | OMI ✔, stemi ✔, rv ✔, reciprocal-avl ✔ | CD prox TIMI 0 | 48,73 |
| A04 | CD con bradicardia y VD | M 63 a, náuseas, PA 85/50, yugulares ↑ | inferior-rca(2@III) + rv(1.2@V4R), sinus-bradycardia 48 | OMI ✔, rv ✔, ST III>II, ST V1 ≥ 0 | CD prox | 48,49 |
| A05 | Inferior por CX | H 55 a, dolor 1 h | inferior-lcx(2@II) + posterior(1@V8) + lateral(1@V6) | OMI ✔, stemi ✔, ST II≥III, aVL ≈ iso | CX dominante | 57,58 |
| A06 | Tombstoning | H 49 a, dolor 30 min, shock | anteroseptal(5@V2, tombstone, terminalDistortion 1) + anterior(4@V3) | OMI ✔, stemi ✔, terminal-qrs-distortion ✔ | DA prox TIMI 0 | 68,69 |
| A07 | Lateral alto / D1 (South African flag) | M 60 a, dolor 50 min | high-lateral(1.5@aVL, straight) | OMI ✔, stemi ✔ (I, aVL), south-african-flag ✔, STD III | D1 TIMI 0 | 55 |
| A08 | DA envolvente | H 62 a, dolor 1 h | anteroapical(2.5@V4) + inferior-lcx(1.2@II) | OMI ✔, stemi ✔ anterior + inferior sin STD recíproca inferior | DA distal envolvente | 56 |
| A09 | Posterior aislado con V7–V9 | M 68 a, dolor epigástrico 3 h | posterior(2@V8, straight), t 180 | OMI ✔, stemi ✔ solo por V7–V9 ≥ 0.5, posterior-std ✔ | CX/OM | 46,47 |
| A10 | STEMI inferior con FV al ingreso→ | H 52 a, RCP 4 min, ECG post‑ROSC | inferior-rca(3@III) + pvc 6/min, emg 0.03 | OMI ✔, stemi ✔ | CD media | 73 |

## B. Oclusión sutil (STEMI− OMI)

| id | título | viñeta | scenario | esperado | angiografía | refs |
|---|---|---|---|---|---|---|
| B01 | T hiperagudas DA | H 47 a, dolor 25 min, ECG "normal" según triage | anterior(0.6@V3, concave, hT 2.0), t 12 | OMI ✔, stemi ✘, hyperacute-t ✔ | DA media TIMI 1 | 26,27 |
| B02 | De Winter | H 44 a, fumador, dolor 45 min | anterior(−1.5@V3, depression-upsloping, hT 1.6) + anteroseptal(0.7@aVR‑like: usar st 0.4@V1) | OMI ✔, stemi ✘, de-winter ✔ | DA prox TIMI 0 | 36,37 |
| B03 | STE sutil V2–V3 vs RP: Smith 4v positivo | H 39 a, dolor 1 h | anterior(1.2@V3, straight, hT 0.8), QTc 420 | OMI ✔, stemi ✘, smith-4v ≥ 18.2 | DA media | 66,67 |
| B04 | Posterior sin V7–V9 (STD V1–V4) | M 72 a, dolor 2 h, troponina 85 | posterior(1.4@V8) | OMI ✔, stemi ✘ (si se omiten V7–V9), posterior-std ✔ | CX TIMI 0 | 46,47 |
| B05 | Aslanger | H 69 a, DM, 3 vasos conocidos, dolor 1 h | inferior-rca(1.2@III) + subendocardial(1.0@V5) | OMI ✔, stemi ✘, aslanger ✔ | CD aguda + enfermedad 3 vasos | 45 |
| B06 | Inferior sutil con aVL recíproca | M 58 a, dolor 40 min | inferior-rca(0.8@III, concave, hT 1.2) | OMI ✔, stemi ✘, reciprocal-avl ✔, hyperacute-t ✔ | CD media | 70 |
| B07 | Lateral sutil / OM | H 61 a, dolor 3 h intermitente | lateral(0.7@V6, straight) + posterior(0.6@V8) | OMI ✔ (rulesMiss posible → documentar), stemi ✘ | OM1 TIMI 1 | 57 |
| B08 | LBBB + Sgarbossa modificado | M 76 a, LBBB conocido, dolor 1 h | lbbb + anteroseptal(1.5@V2, straight) | OMI ✔, sgarbossa-modified ✔, barcelona ✔ | DA prox | 62,63 |
| B09 | Marcapasos + oclusión | H 80 a, MP VVI, dolor 2 h | paced + inferior-rca(1.5@III) | OMI ✔, sgarbossa-modified ✔ | CD | 62,64 |
| B10 | BRD + STE anteroseptal | H 66 a, dolor 1 h, hipotensión | rbbb + anteroseptal(2@V2, convex) | OMI ✔, stemi ✔ (BRD no oculta STE), alto riesgo | DA prox pre‑S1 | 65 |
| B11 | Distorsión terminal con STE sutil | H 50 a, dolor 35 min | anterior(1.4@V3, convex, terminalDistortion 0.9) | OMI ✔, stemi ✘, terminal-qrs-distortion ✔ | DA | 68 |
| B12 | Wellens A tras dolor resuelto | H 54 a, dolor 30 min ayer noche, hoy sin dolor | anterior(3@V3) rep@40, t 720 | OMI reperfundida (culpable crítica) ✔, wellens ✔, stemi ✘ | DA prox 95 % TIMI 3 | 38,39 |
| B13 | Wellens B | M 59 a, sin dolor, troponina 120 | anterior(3@V3) rep@60, t 2000 | wellens ✔ (B), stemi ✘ | DA prox 90 % | 38,39 |
| B14 | Pseudonormalización (reoclusión) | H 57 a, Wellens previo, dolor recurre | anterior(3@V3) rep@60 reocc@1500, t 1508 | OMI ✔, T positivas "normales" (pseudonormalización), stemi ✘ | DA prox TIMI 0 | 71,72 |

## C. Isquemia sin oclusión (NOMI)

| id | título | viñeta | scenario | esperado | angiografía | refs |
|---|---|---|---|---|---|---|
| C01 | STD difusa + STE aVR por demanda | M 81 a, taquicardia 130, Hb 6.5 | subendocardial(1.5@V5), sinus 130 | OMI ✘, avr-diffuse-std ✔, stemi ✘ | sin culpable / 3 vasos estable | 51,52 |
| C02 | Tronco común subtotal | H 70 a, dolor + shock | subendocardial(2.5@V5) + anteroseptal(1@V1) | OMI ✔ (angio urgente), avr-diffuse-std ✔ | TCI 95 % | 51,53 |
| C03 | NSTEMI verdadero, STD lateral | H 64 a, dolor 4 h, troponina 300 | lateral con profile subendocardial local: subendocardial(0.8@V5) | OMI ✘ | CX 80 % TIMI 3 | 9 |
| C04 | Isquemia en TSV | M 45 a, palpitaciones, STD durante 180 lpm | subendocardial(1.2@V5), sinus 180 (usar TSV: HR 180, P oculta) | OMI ✘, avr-diffuse-std ✔ | normal | 52 |

## D. Mimics (controles negativos)

| id | título | viñeta | scenario | esperado | refs |
|---|---|---|---|---|---|
| D01 | Repolarización precoz | H 24 a, dolor pleurítico | anterior(1.2@V3, concave, hT 0) + J‑notch (a_T ×1.3, QTc 380, R V4 alta 2.5 mV) | OMI ✘, smith-4v < 18.2, stemi ✔ técnico (falso STEMI+) | 66,67,75 |
| D02 | Pericarditis | H 31 a, dolor postural | STE difusa cóncava: anterior(1@V3) + inferior-lcx(1@II) + lateral(0.8@V6), depresión PR (PR −0.08 mV), STE aVR ✘ | OMI ✘ | 75 |
| D03 | HVI con strain | M 70 a, HTA, disnea | lvh + strain, STE V1–V2 discordante 1.5 mm | OMI ✘, stemi ✘ (proporcionalidad) | 16,76 |
| D04 | LBBB sin isquemia | H 78 a, LBBB crónico | lbbb (STE discordante V1–V3 2–3 mm) | OMI ✘, sgarbossa ✘, barcelona ✘ | 61,62 |
| D05 | Hiperpotasemia | H 60 a, ERC, K 7.2 | T picudas estrechas (a_T ×2.2, σ_T ×0.6), QRS 130, P plana, STE V1–V2 1 mm | OMI ✘, hyperacute-t ✘ (T estrecha) | 77 |
| D06 | Brugada tipo 1 | H 42 a, síncope | v1v2-high‑like: STE coved V1–V2 2 mm con T negativa (anteroseptal st 2 tInversion 1, sin recíprocos inferiores) | OMI ✘ | 78 |
| D07 | Takotsubo | M 67 a, estrés emocional | anteroapical(1.5@V4) + inferior-lcx(0.8@II), QTc 500, sin recíproca aVL | OMI ✘ (indistinguible por ECG → angio) | 79 |
| D08 | Miocarditis | H 28 a, viral previo | anterior(1@V3, concave) + lateral(0.8@V6), pvc 4/min | OMI ✘ | 75 |
| D09 | Embolia pulmonar | M 50 a, disnea, S1Q3T3 | rbbb incompleto + rv(0.5@V1) tInversion 0.8 en V1–V3, sinus 115 | OMI ✘ | 80 |
| D10 | Aneurisma VI (STE persistente) | H 66 a, IAM anterior 2 años | anterior(1.5@V3) + qLoss 1, tInversion 0.3, T/QRS bajo | OMI ✘, pathological-q ✔ | 81 |
| D11 | Hipotermia (Osborn) | H 55 a, T 29 °C | onda J: J +0.4 mV en V3–V6 (shape concave st 1@V4 con τ corto), sinus-bradycardia 45, baselineWander alto (temblor emg 0.08) | OMI ✘ | 82 |
| D12 | WPW | M 33 a, palpitaciones | PR 100 ms, onda delta (componente inicial ancha), T discordante lateral | OMI ✘ | 82 |
| D13 | Atleta | H 22 a, chequeo | sinus-bradycardia 46, a_T ×1.4, STE cóncava 1 mm V2–V4 | OMI ✘, hyperacute-t ✘ | 75 |
| D14 | Inversión de electrodos LA‑RA | H 60 a, "IAM lateral" en triage | placement la-ra-swap, sin lesión | OMI ✘, artefacto ✔ (I invertida, aVR positiva) | 99 |

## E. Dinámica

| id | título | scenario | esperado | refs |
|---|---|---|---|---|
| E01 | Serie DA: 0 → 10 → 40 → 120 min | anterior(3@V3, hT 1.5) con timeline continua | hyperacute-t antes de stemi; reglas cambian con t | 22,23 |
| E02 | Reperfusión exitosa | inferior-rca(3@III) rep@50, aivr 10 min post | STE ↓ 50 % a 60–90 min, AIVR, T inversión | 71,74 |
| E03 | Reoclusión | anterior(3@V3) rep@60 reocc@240 | pseudonormalización → STE recurrente | 71,72 |
| E04 | Multivaso Aslanger dinámico | B05 con timeline | STE III aparece sobre STD difusa | 45 |

## F. Adquisición

| id | título | scenario | esperado | refs |
|---|---|---|---|---|
| F01 | Filtro monitor 0.5 Hz | A02 con highPassHz 0.5 unidireccional | distorsión del ST vs 0.05 Hz (comparación lado a lado) | 33,99 |
| F02 | Ruido EMG y wander | B01 con emg 0.06, baselineWander 0.3 | T hiperaguda difícil; botón "señal limpia" | 99 |
| F03 | V1–V2 altos | normal con v1v2-high | rSr′ y T neg V1–V2 (mimic) | 99 |
| F04 | Powerline 60 Hz + LP 40 Hz | A03 con powerline 0.08 | efecto del filtro sobre espigas/ruido | 33 |

## Campos por caso (`CaseDefinition`)

```ts
interface CaseDefinition {
  id: string;                 // 'A01'
  group: 'A'|'B'|'C'|'D'|'E'|'F';
  title: string;
  difficulty: 1|2|3;
  vignette: { age: number; sex: 'M'|'F'; history: string; vitals?: string; troponin?: string; symptomsOnsetMin?: number };
  scenario: Scenario;
  ecgAtMin?: number;          // t del ECG (por defecto scenario.timeline)
  expected: {
    omi: boolean;             // ¿oclusión aguda (o reperfundida con culpable crítica)?
    activateCathLab: boolean; // decisión docente
    culprit?: string;
    positiveFindings: FindingId[];
    negativeFindings: FindingId[];
    rulesMiss?: string;       // explicación cuando omi=true pero las reglas no lo detectan
  };
  angiography: string;
  teachingPoints: string[];   // 3–6 puntos
  pitfalls?: string[];
  refs: number[];             // bibliografía de la revisión
}
```
