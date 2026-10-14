# Integraciones (ejemplos, no probados en cada cliente salvo indicación)

| Artefacto | Cliente | Estado |
|---|---|---|
| `skills/plano-diagrams/SKILL.md` | Cualquier cliente Agent Skills (Claude Code, Codex, Gemini CLI, OpenHands…) — copiar a `.agents/skills/` o `.claude/skills/` | Formato según agentskills.io; **no** probado en sesiones reales |
| Servidor MCP `src/mcp.ts` | Cualquier cliente MCP stdio | **Probado** con el cliente oficial del SDK (`bench/mcp-session.ts`) |
| `hooks/plano-check-hook.mjs` | Común a los tres clientes | **Probado con eventos simulados** (exit 2 + diagnóstico ante error) |
| `hooks/claude-code.settings.json` | Claude Code | Sintaxis según docs (13‑10‑2026); no ejecutado en el cliente |
| `hooks/codex.config.toml` | Codex | Sintaxis según docs; no ejecutado |
| `hooks/gemini.settings.json` | Gemini CLI | Sintaxis según docs; no ejecutado |
| `openhands/mcp.json` | OpenHands CLI ≥ 1.0 | Formato según docs; no ejecutado |
| `github/plano-check.yml` | GitHub Actions | No ejecutado |

## Registro del servidor MCP

```jsonc
// Claude Code (.mcp.json) / Cursor / VS Code (formato mcpServers)
{ "mcpServers": { "plano": { "command": "node", "args": ["<ruta>/prototype/src/mcp.ts"], "env": { "PLANO_WORKSPACE": "${workspaceFolder}" } } } }
```

```toml
# Codex (~/.codex/config.toml o .codex/config.toml en proyectos de confianza)
[mcp_servers.plano]
command = "node"
args = ["<ruta>/prototype/src/mcp.ts"]
env = { PLANO_WORKSPACE = "." }
```

Lógica en el núcleo vs. adaptadores: **todo** (parseo, operaciones, layout, validación, render) vive en `src/index.ts`; los adaptadores solo traducen entradas/salidas y aplican políticas de acceso (workspace, extensión).
