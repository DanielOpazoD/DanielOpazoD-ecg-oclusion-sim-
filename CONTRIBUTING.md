# Contribuir

## Puesta en marcha

```bash
nvm use            # Node 22
npm ci
npm run dev        # servidor en http://localhost:5173
```

## Antes de abrir una PR

- `npm run check` debe estar verde (formato, lint, typecheck, tests, build).
- Commits en estilo **Conventional Commits** (`feat(engine): …`, `fix(cases): …`, `docs: …`).
- Código y comentarios en inglés; cadenas de usuario en español.

## Añadir un caso

1. Define el escenario en `src/cases/groupX.ts` siguiendo docs/CASES.md (viñeta, escenario,
   expectativas, angiografía, ≥4 puntos docentes, ≥2 trampas, refs de la bibliografía).
2. La historia de la viñeta **no debe describir el ECG** (hay un test que lo exige).
3. Verifica las medidas con `npx tsx tools/dump-cases.ts <ID>`.

## Añadir una regla

1. Nuevo fichero en `src/analysis/rules/` devolviendo un `Finding` (positivo, umbrales,
   rationale con los números reales, refs).
2. Regístrala en `analyzeEcg` y documenta el gate en docs/MODEL.md §8.
3. Añade tests positivo y negativo en `src/analysis/rules.test.ts`.

## Determinismo

Mismo `Scenario` + misma `seed` ⇒ misma señal. No introducir fuentes de aleatoriedad sin
semilla; la variabilidad por paciente usa un stream de PRNG propio.
