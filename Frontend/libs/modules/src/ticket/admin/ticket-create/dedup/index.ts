export { DEDUP_CHECK_TIMEOUT_MS, runDedupCheck } from './dedup-check';
export type {
  DedupCheckInput,
  DedupCheckResult,
  DedupHint,
} from './dedup-check';
export { recordSubmittedAnyway } from './record-outcome';
export { useDedupSubmitFlow } from './use-dedup-submit-flow';
export type { DedupFlowActions, DedupFlowState } from './use-dedup-submit-flow';
export { buildCandidateMapHref } from './candidate-link';
