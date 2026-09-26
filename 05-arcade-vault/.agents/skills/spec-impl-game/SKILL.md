---
name: spec-impl-game
description: Implementa una spec aprobada de un juego de Arcade Vault con el mismo flujo que /spec-impl (valida estado, crea rama, implementa paso a paso con pausas) y, al terminar, lanza en secuencia —nunca en paralelo— el agente skin-designer (3 skins) y después el agente mobile-porter (controles táctiles) sobre ese juego.
disable-model-invocation: true
argument-hint: <NN-spec-name | ruta de la spec>
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Agent, Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(git log:*), Bash(git diff:*), Bash(git stash:*), Bash(cat:*), Bash(ls:*), Bash(npm run lint:*), Bash(npm run build:*)
---

# /spec-impl-game — /spec-impl + skins + móvil

## Contexto de la sesión

Estado del repositorio:
!`git status --short`

Rama actual:
!`git branch --show-current`

Specs en `specs/`:
!`ls specs/ 2>/dev/null || echo "No existe la carpeta specs/"`

Specs de game-jam:
!`ls specs/game-jam/*/ 2>/dev/null || echo "Sin specs de game-jam"`

Configuración de ramas:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, sin archivo de config)"`

Juegos con motor (`GAME_ENGINES`):
!`grep -oE '^  "?[a-z-]+"?: \{' lib/games/registry.ts 2>/dev/null || echo "No se pudo leer lib/games/registry.ts"`

---

## Instrucciones

Seis fases en orden estricto. **No avances de fase si la anterior no terminó bien.**

### Fases 1–4 — Exactamente las de `/spec-impl`

Lee `.agents/skills/spec-impl/SKILL.md` y ejecuta sus **Fases 1, 2, 3 y 4 al pie de la
letra**, con el argumento `$ARGUMENTS` y el contexto de sesión de arriba. Todas sus reglas
aplican sin cambios: solo specs en estado "Aprobado" (o equivalente), comprobación del
working tree, rama `spec-NN-slug` según `AutoCreateBranch`, resumen de la spec, pausa tras
cada paso esperando confirmación, nunca commit automático, parar ante ambigüedades o
peticiones fuera de alcance.

Únicas ampliaciones:

- **Fase 1:** busca la spec también en `specs/game-jam/<game-id>/` (el usuario puede dar
  la ruta, el número o el slug). Si hay varias coincidencias, pregunta cuál.
- **Fase 3:** para una spec de game-jam la rama es `spec-<game-id>-NN-slug`
  (p. ej. `specs/game-jam/ranaria/01-frogger-core.md` → `spec-ranaria-01-frogger-core`).
- **Fin de Fase 4:** no muestres todavía el mensaje final de `/spec-impl`
  ("✅ All steps of the plan are implemented…"); pasa a la Fase 5.

Si `/spec-impl` te ordena parar en cualquier punto (estado no aprobado, spec no encontrada,
el usuario no confirma…), **para también aquí**: no hay Fase 5 ni agentes.

### Fase 5 — Comprobaciones previas a los agentes

1. Determina el `<slug>` del juego: el id que define la spec y que ahora es clave de
   `GAME_ENGINES` en `lib/games/registry.ts`.
2. Confirma leyendo `lib/games/registry.ts` que `<slug>` tiene motor. Si no lo tiene,
   para: explica que `skin-designer` y `mobile-porter` solo trabajan con juegos con motor
   y no lances ningún agente.
3. Ejecuta `npm run lint` y `npm run build`. Si fallan, arréglalo (dentro del alcance de la
   spec) antes de seguir; si no puedes, para e informa.
4. Pregunta al usuario con AskUserQuestion:
   - **Continuar** — lanzar `skin-designer` y después `mobile-porter` sobre `<slug>` (recomendado).
   - **Solo skins** — lanzar únicamente `skin-designer`.
   - **Saltar** — terminar sin agentes.

### Fase 6 — Agentes en secuencia (nunca en paralelo)

Lanza cada agente con la herramienta `Agent` en **una llamada aparte**, y no lances el
siguiente hasta tener el resultado del anterior.

1. **`skin-designer`** (`subagent_type: "skin-designer"`). Prompt con: `<slug>`, ruta de la
   spec, rama activa y la orden "aplica y verifica los 3 skins (`clasico`, `neon`, `retro`)
   **solo** a `<slug>`, actualiza `References/resources/resources/game-with-themes.md`, no
   hagas commits".
2. Revisa su resultado. Si falló, quedó a medias o pidió una decisión al usuario: para,
   cuéntaselo al usuario y **no** lances `mobile-porter` hasta que él lo indique.
3. **`mobile-porter`** (`subagent_type: "mobile-porter"`), salvo que el usuario eligiera
   "Solo skins". Prompt con: `<slug>`, ruta de la spec, rama activa, "los skins ya los aplicó
   `skin-designer`: no los modifiques", "actualiza
   `References/resources/resources/mobile-status.md`, no hagas commits".
4. Revisa su resultado del mismo modo.

### Cierre

Resume al usuario en pocas líneas:

- Qué pasos de la spec se implementaron.
- Qué hizo `skin-designer` y qué hizo `mobile-porter` (archivos tocados, avisos).
- Siguiente paso: verificar uno a uno los criterios de aceptación de la spec; si pasan,
  cambiar su estado a "Implementado" y hacer el commit final antes de mergear la rama.
- Probar en móvil real por LAN (`npm run dev` → `/jugar/<slug>`, con su IP en
  `allowedDevOrigins` de `next.config.ts`, ajuste local que no se commitea).

Nunca hagas commit por tu cuenta, tampoco al final.
