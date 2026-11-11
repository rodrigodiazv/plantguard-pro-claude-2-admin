# CLAUDE.md — plantguard-pro-claude-2-admin

## Contexto del Proyecto

Panel de administración para PlantGuard Pro — Sistema de control central de cultivos.

## Protocolo de ahorro (siempre activo)

1. **Modelo justo para cada tarea:** tareas mecánicas → subagentes `haiku`/`sonnet`
2. **Contexto mínimo:** leer solo las líneas necesarias; nada de reescribir archivos enteros
3. **Una sola pasada:** agrupar cambios, probar una vez, un único PR
4. **Respuestas cortas:** sin repetir lo ya dicho
5. **`handoff.md` al día** al terminar cada tarea
6. **Avisar antes de tarea larga** y proponer cambio de modelo para ahorrar

**Sistema:** Autenticación por código de un solo uso, panel centralizado de cultivos, análisis de datos.

---

## 🕷️ GRAPHIFY — Araña inteligente (ahorra -70% tokens)

**REGLA:** Graphify primero, grep/read después.

| Necesitas | Usa | Ahorro |
|---|---|---|
| Dónde está `getPIN` | `graphify_find("getPIN")` | ↓70% |
| Quién llama a `getPIN` | `graphify_callers("getPIN")` | ↓60% |
| Impacto de cambiar archivo | `graphify_impact("archivo.js")` | ↓80% |
| Tests para archivo | `graphify_tests_for("archivo.js")` | ↓50% |

**Ahorro real:** búsqueda de símbolo tarda 1.5k tokens en lugar de 15k tokens (90% menos).

**Usa Graphify para:** símbolos, funciones, dependencias, impacto.
**Usa grep para:** texto literal, comentarios, búsquedas amplias.
