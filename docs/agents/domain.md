# Domain Docs

How the Matt Pocock engineering skills should consume Tracknologia's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- Relevant ADRs under `docs/adr/`.
- Relevant feature documentation under `docs/` and `docs/features/`.

If a referenced file does not exist, proceed silently. The `/domain-modeling` skill can create or update domain documentation when terms or decisions are actually resolved.

## File structure

Tracknologia is a single-context repo:

```text
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   └── features/
└── src/
```

Use `CONTEXT.md` as the canonical glossary. Use ADRs only for decisions that are expensive to reverse, surprising without context, and represent a real trade-off.

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary or `AGENTS.md` explicitly avoids.

If the concept needed is not in the glossary yet, either reconsider whether the project already has a better term or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it.
