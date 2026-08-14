# runtime-mcp

Stateless local MCP server for Vindicate Playwright automation.

## Role

Serves bundled workflow content (`vindicate_workflow`), browser/recording proxies to the runtime worker, files-as-truth codegen (`vindicate_generate_code`), test execution, scaffold templates, and inline panels. Holds **no job state** between tool calls.

## Tool surface (20)

Workflow: `vindicate_workflow` · `vindicate_validate_story` · `vindicate_ask_user` · `vindicate_design` · `vindicate_show_panel`

Codegen / project: `vindicate_generate_code` · `scaffold_project` · `run_tests`

Browser: `browser_session` · `browser_navigate` · `browser_read` · `browser_act` · `browser_assert`

Recording: `browser_record_start` · `browser_record_finalize` · `browser_record_discard` · `browser_record_list` · `browser_record_read` · `browser_record_annotate` · `browser_record_get`

## Content bundle

Workflow graphs, node guidance, refs, and scaffold templates live under `content/` and are copied to `dist/` at build time. `scripts/validate-content.ts` runs in prebuild.

## Commands

```bash
pnpm dev          # watch mode
pnpm build        # validate content + vindicate-ui + tsc + copy content
pnpm test
```

## Configuration

See `.env.example`. Required: `VINDICATE_INTERNAL_KEY`, `VINDICATE_PROJECT_ROOT`. Optional worker URL overrides default `http://127.0.0.1:9121`.

## Legacy `.vindicate/schemas/`

Codegen no longer reads or writes schema files. Projects upgraded from older Vindicate releases may still have `.vindicate/schemas/` on disk — safe to delete; the audit node warns if present.
