# Frontend render measurement

React Compiler reduced median React render time for opening and closing a station drawer from 26.85 ms to 15.65 ms, a 41.7% reduction in this scenario. The p95 fell from 34.60 ms to 21.90 ms. Both builds made three React commits per action.

The comparison uses production `next build --profile` builds of the same refactored source, with `reactCompiler` enabled and disabled. It measures the sum of the root's `actualDuration` values during each action through the React DevTools commit hook. It does not measure browser paint, network latency, page load or all application workflows.

## Conditions

- Next.js 16.4.2, React 19.2.5, Node.js 22.20.0, local Chromium at 1536 × 960 CSS pixels.
- `/list/station`, 25 rows, signed in with the same account and backend data.
- Open the 員山鄉加水站 drawer and close it with 關閉詳情. Wait 250 ms after each action.
- Three batches per build. Each batch has five warmup cycles followed by ten measured cycles, giving 60 measured actions per build. Run batches in alternating order.
- Local proxies forward to each standalone build and rewrite Origin/Referer to an allowed local app origin, so the backend applies the same authentication checks on the profiling ports.

The [raw samples](frontend-performance.json) include each action's render time and commit count. The earlier pre-refactor recording used different session conditions, so it is excluded from this compiler comparison.

## Repeat

1. Build the public app with `pnpm exec next build --profile` from `apps/demo`. Copy its standalone output, static assets and public directory into an isolated temporary directory.
2. Build the same source with `reactCompiler: false`, copy that output separately, then restore `reactCompiler: true`.
3. Start each standalone server on a separate port. Use the same browser profile, viewport and backend. Wait until the list has loaded before measuring.
4. Temporarily wrap `window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot`, recording `root.current.actualDuration` for each commit. Preserve and restore the original callback. Sum commit durations within each action window.
5. Collect the warmup and measured cycles above. Compare medians and p95 from all measured actions, and confirm the drawer, URL and commit counts still behave the same.
