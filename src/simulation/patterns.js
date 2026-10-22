/**
 * Verified Lenia organism patterns (data only; no WebGL, no decoding).
 *
 * ORBIUM_O2U is the upstream catalogue entry "O2u" (Orbium unicaudatus) copied
 * programmatically, never retyped, from:
 *   repo   https://github.com/Chakazul/Lenia   (MIT, (c) 2018 Bert Chan)
 *   commit adfc542939266de7f4bb7ebb552e8499701ee107
 *   file   Python/animals.json   (entry with "code": "O2u")
 * See THIRD_PARTY_NOTICES.md for the licence text and attribution.
 *
 * Upstream parameter record: R=13, T=10, b="1", m=0.15, s=0.015, kn=1, gn=1.
 *   kn=1 -> kernel core "bump4" (exponential core, alpha = 4)   == src/simulation/kernel.js kernelCore
 *   gn=1 -> growth mapping "gaus"                               == src/simulation/kernel.js growth
 *   b="1" -> a single kernel ring (beta = [1])                  == the only ring buildKernel() makes
 *
 * SIGMA DISCREPANCY (documented, not resolved by guesswork). Published sources disagree on
 * Orbium's growth width:
 *   0.015  upstream catalogue Python/animals.json "O2u" (this entry; its stored cells match it)
 *   0.016  Figure 6/7 captions of Chan (2019), arXiv:1812.05433
 *   0.017  older upstream JavaScript catalogue (JavaScript/Lenia-LifeForms.js "O2(a)")
 *   0.014  upstream "O2b" (Orbium bicaudatus) and third-party ports
 * We use 0.015 because it is the value stored with this exact pattern. The organism is sensitive
 * to sigma (see tests/unit/patterns.test.js): 0.015 and 0.016 persist, 0.014 evaporates.
 *
 * The pattern is defined at kernel radius R = 13 cells. It is NOT scale-free in this project:
 * it must be simulated with radius 13. Do not rescale it; changing radius changes the organism.
 */
export const ORBIUM_O2U = Object.freeze({
  id: 'O2u',
  name: 'Orbium unicaudatus',
  source: Object.freeze({
    repository: 'https://github.com/Chakazul/Lenia',
    commit: 'adfc542939266de7f4bb7ebb552e8499701ee107',
    file: 'Python/animals.json',
    code: 'O2u',
    license: 'MIT',
    copyright: 'Copyright (c) 2018 Bert Chan',
  }),
  /** Simulation parameters in this project's vocabulary (see src/config.js / params.js). */
  params: Object.freeze({ radius: 13, timeSteps: 10, mu: 0.15, sigma: 0.015 }),
  /** Upstream RLE, verbatim (LeniaND.py format: '$' ends a row, '!' ends the pattern). */
  rle: '7.MD6.qL$6.pKqEqFURpApBRAqQ$5.VqTrSsBrOpXpWpTpWpUpCrQ$4.CQrQsTsWsApITNPpGqGvL$3.IpIpWrOsGsBqXpJ4.LsFrL$A.DpKpSpJpDqOqUqSqE5.ExD$qL.pBpTT2.qCrGrVrWqM5.sTpP$.pGpWpD3.qUsMtItQtJ6.tL$.uFqGH3.pXtOuR2vFsK5.sM$.tUqL4.GuNwAwVxBwNpC4.qXpA$2.uH5.vBxGyEyMyHtW4.qIpL$2.wV5.tIyG3yOxQqW2.FqHpJ$2.tUS4.rM2yOyJyOyHtVpPMpFqNV$2.HsR4.pUxAyOxLxDxEuVrMqBqGqKJ$3.sLpE3.pEuNxHwRwGvUuLsHrCqTpR$3.TrMS2.pFsLvDvPvEuPtNsGrGqIP$4.pRqRpNpFpTrNtGtVtStGsMrNqNpF$5.pMqKqLqRrIsCsLsIrTrFqJpHE$6.RpSqJqPqVqWqRqKpRXE$8.OpBpIpJpFTK!',
});
