// Acceptance tests for rate-control and regularity modules.
// The functions under test are extracted verbatim from the analyzer HTML.

const { extractFunctions } = require('./extract_functions');
const state = {
    msPerFrame: 2.0, umPerPixel: 1.0,
    roiHeight: 0, roiWidth: 0,
    ff0Image: null, apMask: null, roiColumnMask: null,
    rateControl: {
        windowLength_ms: 100, windowOffset_ms: 20,
        bandLoFactor: 2, bandHiFactor: 20,
        notchWidthFactor: 0.15, nHarmonics: 4,
        cvCutoff: 0.10, minAPs: 3
    }
};
global.state = state;
eval(extractFunctions([
    'RC_SLOPE_UNITS', 'RC_SLOPE_POLARITY', 'rcMedian', 'rcMAD',
    'computeRateControlledNoise', 'computeRegularityMetrics', 'computePoincareMetrics'
]));

let pass = 0, fail = 0;
const t = (label, cond, detail = '') => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`);
    cond ? pass++ : fail++;
};

// Deterministic RNG
let _s = 20260726;
const rnd = () => { _s = (Math.imul(_s, 1664525) + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = (mu, sd) => {
    const u1 = Math.max(1e-12, rnd()), u2 = rnd();
    return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

// ---------------------------------------------------------------------------
// Build a synthetic recording at a given firing rate.
// TRUE subthreshold noise sd is IDENTICAL in both; only the rate differs.
// Each diastole carries a depolarization ramp of fixed SLOPE (per ms), so a
// slower cell accumulates a LARGER ramp excursion across its longer diastole.
// That is precisely the rate confound: whole-diastole SD conflates ramp
// excursion with noise, while the fixed-window + ramp-removal estimator
// should not.
// ---------------------------------------------------------------------------
function buildRecording({ rateHz, noiseSD, nX = 8, durMs = 12000, rampSlopePerMs = 0.0009 }) {
    const msPerFrame = state.msPerFrame;
    const nT = Math.round(durMs / msPerFrame);
    const periodFr = Math.round((1000 / rateHz) / msPerFrame);
    const apDurFr = Math.round(40 / msPerFrame);   // 40 ms AP

    const ff0 = new Float32Array(nT * nX);
    const apMask = new Uint8ClampedArray(nT * nX);
    const apTimings = Array.from({ length: nX }, () => []);

    for (let x = 0; x < nX; x++) {
        let tA = periodFr;
        while (tA + periodFr < nT) {
            const tStart = tA, tEnd = tA + apDurFr;
            for (let tt = tStart; tt <= tEnd && tt < nT; tt++) {
                ff0[tt * nX + x] = 0.30;
                apMask[tt * nX + x] = 1;
            }
            apTimings[x].push({ tStart, tPeak: tStart + 2, tEnd, amplitude: 0.30 });
            // Diastole from tEnd to next AP: linear ramp of FIXED SLOPE + noise
            const nextA = tA + periodFr;
            for (let tt = tEnd + 1; tt < Math.min(nextA, nT); tt++) {
                const elapsedMs = (tt - tEnd) * msPerFrame;
                ff0[tt * nX + x] = rampSlopePerMs * elapsedMs + gauss(0, noiseSD);
            }
            tA = nextA;
        }
    }
    return { ff0, apMask, apTimings, nT, nX };
}

function install(rec) {
    state.roiHeight = rec.nT; state.roiWidth = rec.nX;
    state.ff0Image = rec.ff0; state.apMask = rec.apMask;
    state.roiColumnMask = null;
}

// Uncorrected sigma — exactly what computeSubthresholdNoise does (whole diastole, no ramp removal)
function uncorrectedSigma(rec) {
    const { nT, nX } = rec;
    let vals = [];
    for (let x = 0; x < nX; x++) {
        const d = [];
        for (let tt = 0; tt < nT; tt++) if (!rec.apMask[tt * nX + x]) d.push(rec.ff0[tt * nX + x]);
        const mu = d.reduce((a, b) => a + b, 0) / d.length;
        vals.push(Math.sqrt(d.reduce((a, b) => a + (b - mu) ** 2, 0) / d.length));
    }
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

console.log('\n════ CHECK 1: rate-controlled σ removes the firing-rate bias ════');
console.log('  Two recordings, IDENTICAL true noise SD = 0.020, differing ONLY in rate.\n');

const TRUE_SD = 0.020;
const slow = buildRecording({ rateHz: 1.5, noiseSD: TRUE_SD });
const fast = buildRecording({ rateHz: 4.0, noiseSD: TRUE_SD });

const uSlow = uncorrectedSigma(slow);
const uFast = uncorrectedSigma(fast);

install(slow);
const rSlow = computeRateControlledNoise(slow.apTimings).meanSigma_rateControlled;
install(fast);
const rFast = computeRateControlledNoise(fast.apTimings).meanSigma_rateControlled;

const uGapPct = Math.abs(uSlow - uFast) / ((uSlow + uFast) / 2) * 100;
const rGapPct = Math.abs(rSlow - rFast) / ((rSlow + rFast) / 2) * 100;

console.log(`  Uncorrected σ      slow(1.5 Hz)=${uSlow.toFixed(5)}  fast(4.0 Hz)=${uFast.toFixed(5)}   gap=${uGapPct.toFixed(1)}%`);
console.log(`  Rate-controlled σ  slow(1.5 Hz)=${rSlow.toFixed(5)}  fast(4.0 Hz)=${rFast.toFixed(5)}   gap=${rGapPct.toFixed(1)}%`);
console.log(`  True noise SD = ${TRUE_SD.toFixed(5)}\n`);

t('uncorrected σ shows a substantial rate gap', uGapPct > 10, `(${uGapPct.toFixed(1)}%)`);
t('rate-controlled σ gap is much smaller', rGapPct < uGapPct / 3,
  `(${rGapPct.toFixed(1)}% vs ${uGapPct.toFixed(1)}%)`);
t('rate-controlled σ recovers true SD (slow) within 10%',
  Math.abs(rSlow - TRUE_SD) / TRUE_SD < 0.10, `(${rSlow.toFixed(5)})`);
t('rate-controlled σ recovers true SD (fast) within 10%',
  Math.abs(rFast - TRUE_SD) / TRUE_SD < 0.10, `(${rFast.toFixed(5)})`);
t('uncorrected σ is inflated by the ramp', uSlow > TRUE_SD * 1.2 && uFast > TRUE_SD * 1.05);

console.log('\n════ CHECK 2: regularity — regular vs jittered ════');

function seriesRec(intervalsMsFn, nBeats = 40, nX = 4) {
    const msPerFrame = state.msPerFrame;
    const apTimings = Array.from({ length: nX }, () => []);
    let maxT = 0;
    for (let x = 0; x < nX; x++) {
        let tt = 100;
        for (let b = 0; b < nBeats; b++) {
            apTimings[x].push({ tStart: tt, tPeak: tt, tEnd: tt + 20, amplitude: 0.3 });
            tt += Math.round(intervalsMsFn() / msPerFrame);
        }
        maxT = Math.max(maxT, tt);
    }
    state.roiHeight = maxT + 100; state.roiWidth = nX;
    state.ff0Image = new Float32Array((maxT + 100) * nX);
    state.apMask = new Uint8ClampedArray((maxT + 100) * nX);
    state.roiColumnMask = null;
    return apTimings;
}

const regAP = seriesRec(() => 400);
const regR = computeRegularityMetrics(regAP);
console.log(`  Regular  (400 ms fixed):  CV-IEI=${regR.meanCvIEI.toFixed(4)}  IS=${regR.meanIrregularityScore.toFixed(4)}  modes=${JSON.stringify(regR.modeCounts)}`);
t('regular: CV-IEI ≈ 0', regR.meanCvIEI < 0.01);
t('regular: irregularity score ≈ 0', regR.meanIrregularityScore < 0.01);
t('regular: all columns classified periodic', regR.modeCounts.periodic === 4 && regR.modeCounts.irregular === 0);
t('regular: firing freq ≈ 2.5 Hz', Math.abs(regR.meanFiringFreq_Hz - 2.5) < 0.05,
  `(${regR.meanFiringFreq_Hz.toFixed(3)} Hz)`);

const jitAP = seriesRec(() => Math.max(120, gauss(400, 140)));
const jitR = computeRegularityMetrics(jitAP);
console.log(`  Jittered (400±140 ms):    CV-IEI=${jitR.meanCvIEI.toFixed(4)}  IS=${jitR.meanIrregularityScore.toFixed(4)}  modes=${JSON.stringify(jitR.modeCounts)}`);
t('jittered: CV-IEI rises well above cutoff', jitR.meanCvIEI > 0.10);
t('jittered: irregularity score rises', jitR.meanIrregularityScore > regR.meanIrregularityScore * 10);
t('jittered: all columns classified irregular', jitR.modeCounts.irregular === 4 && jitR.modeCounts.periodic === 0);

const silentAP = Array.from({ length: 4 }, () => [{ tStart: 10, tPeak: 10, tEnd: 20, amplitude: 0.3 }]);
state.roiHeight = 500; state.roiWidth = 4;
state.ff0Image = new Float32Array(2000); state.apMask = new Uint8ClampedArray(2000);
const silR = computeRegularityMetrics(silentAP);
t('1 AP/column → classified silent', silR.modeCounts.silent === 4, JSON.stringify(silR.modeCounts));

console.log('\n════ CHECK 3: Poincaré SD1/SD2 ordering ════');

// (a) Independent jitter: successive intervals uncorrelated → SD1 ≈ SD2, ratio ≈ 1
const indepAP = seriesRec(() => Math.max(120, gauss(400, 60)), 60);
const indepP = computePoincareMetrics(indepAP);
console.log(`  Independent jitter:      SD1=${indepP.summary.meanSD1.toFixed(2)}  SD2=${indepP.summary.meanSD2.toFixed(2)}  ratio=${indepP.summary.meanRatio.toFixed(3)}  centroid=${indepP.summary.meanCentroid.toFixed(1)} ms`);
t('independent: SD1 ≈ SD2 (ratio ≈ 1)', Math.abs(indepP.summary.meanRatio - 1) < 0.20);
t('independent: centroid ≈ 400 ms', Math.abs(indepP.summary.meanCentroid - 400) < 15);

// (b) Slow drift, little beat-to-beat jitter: SD2 >> SD1, ratio << 1
let driftPhase = 0;
const driftAP = seriesRec(() => { driftPhase += 0.12; return 400 + 120 * Math.sin(driftPhase) + gauss(0, 3); }, 60);
const driftP = computePoincareMetrics(driftAP);
console.log(`  Long-term drift only:    SD1=${driftP.summary.meanSD1.toFixed(2)}  SD2=${driftP.summary.meanSD2.toFixed(2)}  ratio=${driftP.summary.meanRatio.toFixed(3)}`);
t('drift: SD2 >> SD1', driftP.summary.meanSD2 > driftP.summary.meanSD1 * 3);
t('drift: ratio well below 1', driftP.summary.meanRatio < 0.35);

// (c) Alternans — strong beat-to-beat alternation: SD1 >> SD2
let alt = false;
const altAP = seriesRec(() => { alt = !alt; return alt ? 480 : 320; }, 60);
const altP = computePoincareMetrics(altAP);
console.log(`  Alternans (480/320):     SD1=${altP.summary.meanSD1.toFixed(2)}  SD2=${altP.summary.meanSD2.toFixed(2)}  ratio=${altP.summary.meanRatio.toFixed(3)}`);
t('alternans: SD1 >> SD2', altP.summary.meanSD1 > altP.summary.meanSD2 * 3);

// Perfect alternans is mathematically degenerate: 2·var − SD1² == 0 exactly, so
// SD2 == 0 and the ratio is undefined. Correct behaviour is NaN (excluded from
// the mean), NOT a spuriously large finite number.
t('alternans: degenerate SD2=0 yields NaN ratio, not a bogus number',
  altP.summary.meanSD2 === 0 && !isFinite(altP.summary.meanRatio));

t('ordering on well-posed regimes: drift ratio < independent ratio',
  driftP.summary.meanRatio < indepP.summary.meanRatio,
  `(${driftP.summary.meanRatio.toFixed(3)} < ${indepP.summary.meanRatio.toFixed(3)})`);

// Robustness: one degenerate column must not poison the recording-level mean.
console.log('\n════ CHECK 4: degenerate column does not poison the summary ════');
{
    const mixed = seriesRec(() => Math.max(120, gauss(400, 60)), 60, 4);
    let a = false;
    mixed[2] = [];                       // column 2 = perfect alternans (SD2 → 0)
    let tt = 100;
    for (let b = 0; b < 60; b++) {
        mixed[2].push({ tStart: tt, tPeak: tt, tEnd: tt + 20, amplitude: 0.3 });
        a = !a; tt += Math.round((a ? 480 : 320) / state.msPerFrame);
    }
    const mp = computePoincareMetrics(mixed);
    console.log(`  3 normal cols + 1 degenerate:  meanRatio=${mp.summary.meanRatio.toFixed(3)}  nColsWithData=${mp.summary.nColsWithData}`);
    t('meanRatio stays finite despite a NaN column', isFinite(mp.summary.meanRatio));
    t('degenerate column ratio is NaN', !isFinite(mp.sd1sd2RatioPerCol[2]));
}

console.log(`\n${'═'.repeat(66)}`);
console.log(`Result: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
