// End-to-end: run the real compute chain on a realistic synthetic SAN recording
// and quantify how much each correction moves sigma and beta.
const { extractFunctions } = require('./extract_functions');

const state = {
    msPerFrame: 2.0, umPerPixel: 1.0,
    roiHeight: 0, roiWidth: 0,
    ff0Image: null, apMask: null, roiColumnMask: null,
    detrend: { enabled: false, method: 'rollingMedian', driftWindow_ms: 500 },
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
    'computeFFT', 'rollingMedian', 'detrendColumn', 'computeSubthresholdNoise',
    'computeRateControlledNoise', 'computePSD', 'computeRateMatchedPSD',
    'computeRegularityMetrics', 'computePoincareMetrics'
]));

let _s = 424242;
const rnd = () => { _s = (Math.imul(_s, 1664525) + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = (mu, sd) => {
    const u1 = Math.max(1e-12, rnd()), u2 = rnd();
    return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

// Realistic SAN line scan: APs on a rhythm, diastolic depolarization ramp,
// 1/f-ish noise (random walk + white), and a slow photobleach-like drift.
function buildSAN({ rateHz, noiseSD = 0.020, nX = 40, durMs = 20000,
                    rampSlopePerMs = 0.0009, driftAmp = 0.05 }) {
    const mpf = state.msPerFrame;
    const nT = Math.round(durMs / mpf);
    const periodFr = Math.round((1000 / rateHz) / mpf);
    const apDurFr = Math.round(40 / mpf);
    const ff0 = new Float32Array(nT * nX);
    const apMask = new Uint8ClampedArray(nT * nX);
    const apTimings = Array.from({ length: nX }, () => []);

    for (let x = 0; x < nX; x++) {
        // slow drift shared across the column (photobleach residual)
        const drift = new Float32Array(nT);
        let rw = 0;
        for (let tt = 0; tt < nT; tt++) { rw += gauss(0, 1); drift[tt] = rw; }
        let mn = Infinity, mx = -Infinity;
        for (let tt = 0; tt < nT; tt++) { if (drift[tt] < mn) mn = drift[tt]; if (drift[tt] > mx) mx = drift[tt]; }
        const rng = (mx - mn) || 1;
        for (let tt = 0; tt < nT; tt++) drift[tt] = (drift[tt] - mn) / rng * driftAmp;

        let tA = periodFr + Math.round(gauss(0, 3));
        while (tA + periodFr < nT) {
            const tStart = tA, tEnd = tA + apDurFr;
            for (let tt = tStart; tt <= tEnd && tt < nT; tt++) {
                ff0[tt * nX + x] = 0.30 + drift[tt];
                apMask[tt * nX + x] = 1;
            }
            apTimings[x].push({ tStart, tPeak: tStart + 2, tEnd, amplitude: 0.30 });
            const nextA = tA + periodFr + Math.round(gauss(0, 2));
            for (let tt = tEnd + 1; tt < Math.min(nextA, nT); tt++) {
                const elapsedMs = (tt - tEnd) * mpf;
                ff0[tt * nX + x] = rampSlopePerMs * elapsedMs + gauss(0, noiseSD) + drift[tt];
            }
            tA = nextA;
        }
    }
    return { ff0, apMask, apTimings, nT, nX };
}

function install(rec) {
    state.roiHeight = rec.nT; state.roiWidth = rec.nX;
    state.ff0Image = rec.ff0; state.apMask = rec.apMask; state.roiColumnMask = null;
}
const meanFinite = a => { const f = Array.from(a).filter(isFinite); return f.reduce((x, y) => x + y, 0) / f.length; };

function analyze(label, rec) {
    install(rec);
    state.detrend.enabled = false;
    const nsRaw = computeSubthresholdNoise();
    state.detrend.enabled = true;
    const nsDet = computeSubthresholdNoise();
    state.detrend.enabled = false;

    const rc = computeRateControlledNoise(rec.apTimings);
    const psd = computePSD();
    const rm = computeRateMatchedPSD(rec.apTimings, psd);
    const reg = computeRegularityMetrics(rec.apTimings);
    const poi = computePoincareMetrics(rec.apTimings);

    return {
        label,
        sigmaRaw: meanFinite(nsRaw.sigmaPerCol),
        sigmaDet: meanFinite(nsDet.sigmaPerCol_detrended),
        sigmaRC:  rc.meanSigma_rateControlled,
        nWindows: rc.totalWindows,
        betaRaw: psd.beta, betaR2Raw: psd.betaR2,
        betaRM: rm.beta_rateMatched, betaR2RM: rm.betaR2_rateMatched,
        band: rm.rateMatchedBand_Hz, fBeat: rm.fBeat_Hz,
        cvIEI: reg.meanCvIEI, freq: reg.meanFiringFreq_Hz, IS: reg.meanIrregularityScore,
        modes: reg.modeCounts,
        sd1: poi.summary.meanSD1, sd2: poi.summary.meanSD2, ratio: poi.summary.meanRatio
    };
}

const TRUE_SD = 0.020;
console.log('\n' + '='.repeat(78));
console.log('END-TO-END on realistic synthetic SAN recordings (true noise SD = 0.020 in BOTH)');
console.log('='.repeat(78));

const slow = analyze('slow 1.5 Hz', buildSAN({ rateHz: 1.5, noiseSD: TRUE_SD }));
const fast = analyze('fast 4.0 Hz', buildSAN({ rateHz: 4.0, noiseSD: TRUE_SD }));

const row = (n, a, b) => console.log(`  ${n.padEnd(30)} ${String(a).padStart(12)}  ${String(b).padStart(12)}`);
console.log(`\n  ${''.padEnd(30)} ${'slow 1.5 Hz'.padStart(12)}  ${'fast 4.0 Hz'.padStart(12)}`);
console.log('  ' + '-'.repeat(58));
row('sigma  raw (uncorrected)', slow.sigmaRaw.toFixed(5), fast.sigmaRaw.toFixed(5));
row('sigma  detrended', slow.sigmaDet.toFixed(5), fast.sigmaDet.toFixed(5));
row('sigma  rate-controlled', slow.sigmaRC.toFixed(5), fast.sigmaRC.toFixed(5));
console.log('  ' + '-'.repeat(58));
row('beta   raw (5-80% Nyquist)', slow.betaRaw.toFixed(4), fast.betaRaw.toFixed(4));
row('beta   rate-matched', slow.betaRM.toFixed(4), fast.betaRM.toFixed(4));
row('  band lo (Hz)', slow.band[0].toFixed(2), fast.band[0].toFixed(2));
row('  band hi (Hz)', slow.band[1].toFixed(2), fast.band[1].toFixed(2));
console.log('  ' + '-'.repeat(58));
row('firing freq (Hz)', slow.freq.toFixed(3), fast.freq.toFixed(3));
row('CV-IEI', slow.cvIEI.toFixed(4), fast.cvIEI.toFixed(4));
row('irregularity score', slow.IS.toFixed(4), fast.IS.toFixed(4));
row('SD1 / SD2 (ms)', slow.sd1.toFixed(1) + '/' + slow.sd2.toFixed(1),
                      fast.sd1.toFixed(1) + '/' + fast.sd2.toFixed(1));

const gap = (a, b) => Math.abs(a - b) / ((a + b) / 2) * 100;
const gRaw = gap(slow.sigmaRaw, fast.sigmaRaw);
const gDet = gap(slow.sigmaDet, fast.sigmaDet);
const gRC  = gap(slow.sigmaRC,  fast.sigmaRC);
const gBRaw = gap(slow.betaRaw, fast.betaRaw);
const gBRM  = gap(slow.betaRM,  fast.betaRM);

console.log('\n  RATE BIAS (slow-vs-fast discrepancy; smaller = better rate control)');
console.log(`    sigma raw            ${gRaw.toFixed(1)}%`);
console.log(`    sigma detrended      ${gDet.toFixed(1)}%`);
console.log(`    sigma rate-controlled ${gRC.toFixed(1)}%`);
console.log(`    beta  raw            ${gBRaw.toFixed(1)}%`);
console.log(`    beta  rate-matched   ${gBRM.toFixed(1)}%`);

let pass = 0, fail = 0;
const t = (l, c, d = '') => { console.log(`  ${c ? '✓' : '✗'} ${l}${d ? '  ' + d : ''}`); c ? pass++ : fail++; };
console.log('\n  ASSERTIONS');
t('rate-controlled sigma has far less rate bias than raw', gRC < gRaw / 3, `(${gRC.toFixed(1)}% vs ${gRaw.toFixed(1)}%)`);
t('rate-controlled sigma beats detrending on rate bias', gRC < gDet, `(${gRC.toFixed(1)}% vs ${gDet.toFixed(1)}%)`);
t('rate-controlled sigma near true SD in slow', Math.abs(slow.sigmaRC - TRUE_SD) / TRUE_SD < 0.15);
t('rate-controlled sigma near true SD in fast', Math.abs(fast.sigmaRC - TRUE_SD) / TRUE_SD < 0.15);
t('rate-matched beta reduces rate bias vs raw beta', gBRM < gBRaw, `(${gBRM.toFixed(1)}% vs ${gBRaw.toFixed(1)}%)`);
t('band scales with rate (fast band hi > slow band hi)', fast.band[1] > slow.band[1]);
t('firing freq recovered', Math.abs(slow.freq - 1.5) < 0.1 && Math.abs(fast.freq - 4.0) < 0.2);

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
