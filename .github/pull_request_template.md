<!--
Soft freeze is active for v0.1.0. Every PR into staging must answer the four
questions below. Docs: docs/release/v0.1.0-hardening/handoff/00_POST_MVP_MASTER_HANDOFF.md
-->

## Release justification (soft freeze)

<!-- Delete this section only for branch-policy-exempt automation PRs. -->

1. **Why must this ship in v0.1.0?** (bug/security/reliability fix, scope-valid missing behavior, CI/testing/deployment, required accessibility/UX)
2. **Which Module/interface owns it?**
3. **What regression surface changes?**
4. **Which tests must rerun?**

## Change class

- [ ] Bug / security / reliability fix
- [ ] Scope-valid missing behavior (feature-discovery gate passed)
- [ ] CI / testing / deployment work
- [ ] Required accessibility / UX fix
- [ ] Documentation / chore

## Verification run

<!-- Run what the regression surface requires; never claim a check that did not run. -->

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:run`
- [ ] `pnpm build`
- [ ] `pnpm db:reset` + `pnpm test:db` (required for schema/RLS/policy/trigger/constraint/RPC changes)
