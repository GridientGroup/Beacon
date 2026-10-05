# Price-to-compare catalog: monthly run (runbook)

This runbook is for the scheduled task "Beacon: monthly price-to-compare refresh". Matt asked for the catalog to be maintained monthly with Sonnet workers, and for revisions to be applied automatically ("Update automatically"). Each run follows these steps. It runs unattended, so do not stop to ask questions. When something blocks the run, record it in the run report and continue with the rest.

## What the catalog is

The catalog lives in Supabase project `wnzpoacrdxrddwptpeiz`.

- `public.price_to_compare` has one row per state, utility, fuel, commercial service class and effective period. A row is the default-service supply price for that class.
  - `status` is one of `current`, `needs_review` or `superseded`.
  - `source_url` and `source_quote` record where the figure came from.
- `public.price_to_compare_sources` lists the standing page or pages where each utility or PUC publishes these prices. Utilities post updates on the same page each period, so the monthly check goes to these pages first.
- `public.price_to_compare_runs` logs one row per run.
- Token-gated RPCs. They are callable with the anon key plus a one-time loader token whose sha256 is in `ptc_private.loader_token`:
  - `ptc_export`
  - `ptc_load`: upserts rows and auto-supersedes older periods.
  - `ptc_touch`
  - `ptc_source_status`
- `public.ptc_supersede()` is admin-only.

The scope is 15 states: PA, OH, IL, MA, NY, NJ, MD, DC, DE, CT, RI, NH, ME, MI, TX.

## Steps

1. **Get the tools.**
   - Load the Supabase MCP tools with ToolSearch "+Supabase".
   - Load the Projects, Workflow and SendUserMessage tools if they are deferred.
   - If the Supabase tools are not available, stop. Report with SendUserMessage that the run could not reach Supabase.
2. **Fetch the code.** With `Projects` `project_read`, read these docs and write each to a local working directory such as `~/ptc/`. Copy them byte for byte; if the read returns a local file path, copy that file. If the Projects tool is unavailable, read the same files from Supabase with `select content from ptc_private.files where name='<file name>'`, which holds an identical copy of each.
   - `claude/ptc/ptc_proxy.js`, saved as the proxy workflow script.
   - `claude/ptc/ptc_monthly.js`, saved as the workflow script.
   - `claude/ptc/ptc_tool.py`, saved as the helper.
3. **Set up credentials.**
   - Run `python3 -c "import secrets;print(secrets.token_hex(24))"` to make a token.
   - Compute its sha256 hex locally.
   - Insert the hash with `execute_sql`: `insert into ptc_private.loader_token(token_sha256) values ('<sha256>');`
   - Get the anon key with `get_publishable_keys`; it is the legacy `anon` JWT.
   - Export `PTC_TOKEN` and `PTC_ANON` in each shell command that runs the helper.
4. **Export.** Run `python3 ptc_tool.py export ~/ptc/run`. This writes `<STATE>.json` files and `states.json`.
5. **Run the workers.** Call the Workflow tool with `scriptPath` pointing at the saved `ptc_monthly.js`.
   - Arguments: `{asOf: <today YYYY-MM-DD>, dir: <absolute path of ~/ptc/run>, states: <the states.json content>}`.
   - Concurrency is about 2 agents per workflow, so split the states into 4 groups and launch 4 workflows in parallel:
     - PA, OH, IL, MA
     - NY, NJ, MD, DC
     - DE, CT, RI, NH
     - ME, MI, TX
   - Each workflow pairs one Sonnet re-check worker with one Sonnet verifier per state.
   - Wait for all four to finish. Each one's output file is the task output, a JSON document with key `result`.
6. **Load.** For each output, run `python3 ptc_tool.py load <output-file> ~/ptc/run/<group>`. This updates the catalog automatically:
   - New periods are inserted.
   - Older periods are superseded.
   - Unchanged rows get `last_checked`.
   - Source pages get `last_status`.
   - Moved pages are added as new sources.
6b. **Refresh proxies.** This covers classes that have no published price to compare, such as Con Ed calculator classes, the ERCOT TDUs and hourly-priced large C&I. Matt asked for a labelled estimate rather than a hole.
   - Run `python3 ptc_tool.py export-holes ~/ptc/holes`.
   - Run the Workflow at `claude/ptc/ptc_proxy.js` (fetch it like step 2) with `{asOf, dir: <abs ~/ptc/holes>, states: <holes/states.json>}`. Split the states into up to 4 parallel groups.
   - Load each output with `python3 ptc_tool.py load-proxy <output-file>`.
   - Proxies are stored in the `proxy_*` columns. The row's `price` stays null, so a proxy is never presented as the published price.
7. **Log the run.** Insert one row into `price_to_compare_runs` with `execute_sql`:
   - `kind`: `'monthly'`
   - `states`: the 15 states
   - `rows_added`: the sum of `rows_changed`
   - `rows_changed`: the sum of `superseded`
   - `rows_flagged`: the sum of `rows_flagged`
   - `summary`: the combined stats as jsonb
8. **Report.**
   - Combine the four `report.md` files into one change report.
   - Write it to the project as `claude/ptc/runs/PTC_RUN_<YYYY-MM>.md`.
   - Send Matt a short SendUserMessage: rows changed, rows flagged, source pages that moved, and the report path.
9. **Clean up.** Delete the loader token: `delete from ptc_private.loader_token where token_sha256='<sha256>';`

## Rules for handling the data

- Never type prices into SQL by hand. All rows go through `ptc_tool.py` from verified worker output.
- A changed figure the verifier could not confirm is stored as `needs_review`. It does not supersede the old current row, because only a `current` row supersedes.
- If a workflow fails for a group, re-run that group once. If it fails again, record it in the report.
