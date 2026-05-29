// lib/evals/index.ts
// Central export for all eval modules.
export { runStructuralEval }                from './structural-eval'
export type { StructuralEvalResult }        from './structural-eval'

export { runGroundingEval }                 from './grounding-eval'
export type { GroundingEvalResult }         from './grounding-eval'

export { runConsistencyEval }               from './consistency-eval'
export type { ConsistencyEvalResult, ConsistencyViolation } from './consistency-eval'

export { runRegressionEval, buildEvalSummary, GOLDEN_DATASET } from './regression-eval'
export type { RegressionEvalResult, EvalRunSummary, GoldenCompany } from './regression-eval'
