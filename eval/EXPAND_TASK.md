Expand the ghost frame set. Read eval/COLLECT_TASK.md, eval/build-sites.ts, eval/mine.ts, eval/sites.meta.json.
1. Append 300 more domains to eval/sites.txt from the SAME pinned Tranco list: every 50th of ranks 6001-21000 (deterministic), same name filters, plus 40 more EU/UK/news/commerce/travel sites likely to show consent or newsletter modals. Update sites.meta.json with the new ranges. Never reorder or remove existing lines.
2. Run eval/mine.ts (it skips collected domains). Concurrency 2. Do not change the collector or the target rule.
3. Report final counts in /tmp/ghost-plan/expand.done: total, ok, broken, held, failures by error.
No source comments. No mocks.
