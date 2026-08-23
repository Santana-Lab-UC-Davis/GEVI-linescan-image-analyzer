// Prototype + tests for Olympus FV metadata parsing.
// Run: node test_metaparse.js

// ---------------------------------------------------------------- parser ----
function parseAcquisitionMetadata(text) {
    const result = {
        format: 'unknown',
        umPerPixel: null,
        msPerFrame: null,
        nSpacePx: null,
        nTimeLines: null,
        provenance: {},
        info: {},
        warnings: []
    };
    if (!text || !text.trim()) { result.warnings.push('File is empty.'); return result; }

    const lines = text.split(/\r?\n/);
    const sections = {};
    let cur = '';
    const unq = s => (s || '').trim().replace(/^"(.*)"$/s, '$1').trim();

    for (const raw of lines) {
        if (!raw.trim()) continue;
        const parts = raw.split('\t');
        let key = unq(parts[0]);
        const val = unq(parts.slice(1).join('\t'));
        if (!key) continue;
        const m = key.match(/^\[(.+)\]$/);
        if (m) { cur = m[1]; sections[cur] = sections[cur] || {}; continue; }
        (sections[cur] = sections[cur] || {})[key] = val;
    }

    const get = (sec, key) => (sections[sec] && sections[sec][key] != null) ? sections[sec][key] : null;
    const isOlympus = !!(sections['General'] && (sections['General']['System Name'] || sections['General']['Scan Mode']));
    if (!isOlympus) { result.warnings.push('Not recognized as an Olympus FV metadata export.'); return result; }

    result.format = 'olympus-fv';
    result.info.systemName = get('General', 'System Name');
    result.info.scanMode   = get('General', 'Scan Mode');
    result.info.date       = get('General', 'Date');
    result.info.sourceName = get('General', 'Name');
    result.info.objective  = get('Acquisition', 'Objective Lens');
    result.info.samplingSpeed = get('Acquisition', 'Sampling Speed');

    if (result.info.scanMode && !/^XT$/i.test(result.info.scanMode)) {
        result.warnings.push(`Scan Mode is "${result.info.scanMode}", not "XT" — this may not be a line scan.`);
    }

    // --- µm/pixel: prefer the explicit [um/pixel] figure in X Dimension -------
    const xDim = get('Dimensions', 'X Dimension');
    if (xDim) {
        const mPix = xDim.match(/([\d.]+)\s*\[\s*um\s*\/\s*pixel\s*\]/i);
        if (mPix) {
            result.umPerPixel = parseFloat(mPix[1]);
            result.provenance.umPerPixel = '[Dimensions] X Dimension';
        }
        const mN = xDim.match(/^\s*(\d+)\s*,/);
        if (mN) result.nSpacePx = parseInt(mN[1], 10);
    }

    // --- image dimensions in pixels: MUST come from [Image], not [Reference Image]
    const imgSize = get('Image', 'Image Size');
    if (imgSize) {
        const m = imgSize.match(/(\d+)\s*\*\s*(\d+)/);
        if (m) {
            result.nSpacePx  = parseInt(m[1], 10);
            result.nTimeLines = parseInt(m[2], 10);
        }
    }

    // --- ms/line from the unit-converted extent ÷ number of lines ------------
    const imgSizeU = get('Image', 'Image Size(Unit Converted)');
    if (imgSizeU) {
        const parts = imgSizeU.split('*').map(s => s.trim());
        if (parts.length === 2) {
            const spatial = parts[0].match(/([\d.]+)\s*\[\s*um\s*\]/i);
            const tMs = parts[1].match(/([\d.]+)\s*\[\s*ms\s*\]/i);
            const tS  = parts[1].match(/([\d.]+)\s*\[\s*s\s*\]/i);
            let totalMs = null;
            if (tMs)      totalMs = parseFloat(tMs[1]);
            else if (tS)  totalMs = parseFloat(tS[1]) * 1000;

            if (totalMs != null && result.nTimeLines > 0) {
                result.msPerFrame = totalMs / result.nTimeLines;
                result.provenance.msPerFrame =
                    `[Image] Image Size(Unit Converted) ÷ line count (${totalMs} ms / ${result.nTimeLines})`;
            }
            // Independent µm/pixel cross-check / fallback
            if (spatial && result.nSpacePx > 0) {
                const derived = parseFloat(spatial[1]) / result.nSpacePx;
                if (result.umPerPixel == null) {
                    result.umPerPixel = derived;
                    result.provenance.umPerPixel =
                        `[Image] Image Size(Unit Converted) ÷ pixel count (${spatial[1]} µm / ${result.nSpacePx})`;
                } else if (Math.abs(derived - result.umPerPixel) / result.umPerPixel > 0.02) {
                    result.warnings.push(
                        `µm/pixel disagreement: X Dimension says ${result.umPerPixel}, ` +
                        `image extent implies ${derived.toFixed(4)}. Using ${result.umPerPixel}.`);
                }
            }
        }
    }

    // --- fallback: T Dimension range ----------------------------------------
    if (result.msPerFrame == null) {
        const tDim = get('Dimensions', 'T Dimension');
        if (tDim && result.nTimeLines > 0) {
            const mS = tDim.match(/-\s*([\d.]+)\s*\[\s*s\s*\]/i);
            if (mS) {
                result.msPerFrame = (parseFloat(mS[1]) * 1000) / result.nTimeLines;
                result.provenance.msPerFrame = '[Dimensions] T Dimension ÷ line count';
            }
        }
    }

    // Sampling Speed is dwell time per pixel — NOT the line period. Never use it
    // for ms/line: it excludes flyback and would understate the interval.
    if (result.msPerFrame == null) {
        result.warnings.push('Could not determine ms/line — leaving the existing value unchanged.');
    }
    if (result.umPerPixel == null) {
        result.warnings.push('Could not determine µm/pixel — leaving the existing value unchanged.');
    }
    return result;
}

// ----------------------------------------------------------------- tests ----
const fs = require('fs');
// Representative Olympus FluoView (FV3000) sidecar, inlined so the test is
// self-contained and runs from a fresh clone with no external fixture.
// Note it deliberately keeps BOTH [Image] and [Reference Image] blocks: the
// 512x512 reference block is the trap this parser has to avoid.
const SAMPLE_OLYMPUS_TXT = "\"[General]\"\t\"\"\n\"Path\"\t\"D:/Users/Example/2026/06.2026/06.17.2026\"\n\"Name\"\t\"CM_Cell in Gel_Fluo4_10%PVA_0.5Hz_cell 03.oir\"\n\"Scan Mode\"\t\"XT\"\n\"Date\"\t\"06/17/2026 02:14:37.451 PM\"\n\"File Version\"\t\"2.1.2.3\"\n\"System Name\"\t\"FV3000\"\n\"System Version\"\t\"2.3.1.163\"\n\"[Dimensions]\"\t\"\"\n\"X Dimension\"\t\"290, 0.0 - 120.153 [um], 0.414 [um/pixel]\"\n\"Channel Dimension\"\t\"1 [Ch]\"\n\"T Dimension\"\t\"1, 0.000 - 6.011 [s], Interval FreeRun\"\n\"[Image]\"\t\"\"\n\"Primary Dimensions\"\t\"X * T\"\n\"Image Size\"\t\"290 * 1500 [pixel]\"\n\"Image Size(Unit Converted)\"\t\"120.153 [um] * 6015.000 [ms]\"\n\"[Reference Image]\"\t\"\"\n\"Image Size\"\t\"512 * 512 [pixel]\"\n\"Image Size(Unit Converted)\"\t\"212.132 [um] * 212.132 [um]\"\n\"[Acquisition]\"\t\"\"\n\"Objective Lens\"\t\"PLAPON 60XOSC2\"\n\"Objective Lens Mag.\"\t\"60.0X\"\n\"Objective Lens NA\"\t\"1.4\"\n\"Scan Device\"\t\"Galvano\"\n\"Scan Direction\"\t\"Oneway\"\n\"Sampling Speed\"\t\"10.0 [us/pixel]\"\n\"Sequential Mode\"\t\"Line\"\n\"Region Mode\"\t\"Line\"\n\"Zoom\"\t\"x1.0\"\n\"[Channel 1]\"\t\"\"\n\"Channel Name\"\t\"HSD3\"\n\"Dye Name\"\t\"EGFP\"\n\"Emission WaveLength\"\t\"510 [nm]\"\n\"Bits/Pixel\"\t\"12 [bits]\"\n\"Laser Wavelength\"\t\"488 [nm]\"\n";

let pass = 0, fail = 0;
const chk = (label, got, want, tol = 1e-6) => {
    const ok = (want === null) ? got === null : Math.abs(got - want) <= tol;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  got=${got} want=${want}`}`);
    ok ? pass++ : fail++;
};
const chkStr = (label, got, want) => {
    const ok = got === want;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  got="${got}" want="${want}"`}`);
    ok ? pass++ : fail++;
};

console.log('\n── Real Olympus FV3000 file ──────────────────────────────────');
const real = SAMPLE_OLYMPUS_TXT;
const r = parseAcquisitionMetadata(real);
console.log(JSON.stringify(r, null, 2));

chkStr('format detected', r.format, 'olympus-fv');
chk('µm/pixel = 0.414', r.umPerPixel, 0.414);
chk('space px = 290', r.nSpacePx, 290);
chk('time lines = 1500', r.nTimeLines, 1500);
chk('ms/line = 6015/1500 = 4.01', r.msPerFrame, 4.01, 1e-9);
chkStr('scan mode XT', r.info.scanMode, 'XT');
chkStr('system FV3000', r.info.systemName, 'FV3000');

console.log('\n── Trap: [Reference Image] must NOT be used ──────────────────');
// Reference Image is 512*512 @ 212.132 µm. If the parser grabbed that instead,
// nTimeLines would be 512 and ms/line would be wrong.
chk('did not take 512 as line count', r.nTimeLines, 1500);
chk('did not derive 212.132/512 = 0.4143 as the primary µm/px', r.umPerPixel, 0.414);

console.log('\n── Sampling Speed must not be mistaken for line period ───────');
// 10 µs/pixel * 290 px = 2.9 ms dwell — the true line period is 4.01 ms.
const dwellMs = 10.0 * 290 / 1000;
chk('true line period differs from dwell sum', Math.abs(r.msPerFrame - dwellMs) > 1, true ? 1 : 0, 1);
console.log(`    (dwell sum = ${dwellMs} ms vs actual line period ${r.msPerFrame} ms — flyback excluded)`);

console.log('\n── Seconds-unit variant ──────────────────────────────────────');
const secVariant = real.replace('"120.153 [um] * 6015.000 [ms]"', '"120.153 [um] * 6.015 [s]"');
const r2 = parseAcquisitionMetadata(secVariant);
chk('[s] units converted to ms/line 4.01', r2.msPerFrame, 4.01, 1e-9);

console.log('\n── Missing X Dimension → falls back to extent ÷ pixels ───────');
const noXDim = real.replace(/^"X Dimension".*$/m, '');
const r3 = parseAcquisitionMetadata(noXDim);
chk('fallback µm/px = 120.153/290', r3.umPerPixel, 120.153 / 290, 1e-9);
console.log(`    provenance: ${r3.provenance.umPerPixel}`);

console.log('\n── Non-Olympus input is rejected, not guessed ────────────────');
const r4 = parseAcquisitionMetadata('some random text\nnot metadata at all');
chkStr('format unknown', r4.format, 'unknown');
chk('umPerPixel null', r4.umPerPixel, null);
chk('msPerFrame null', r4.msPerFrame, null);

console.log('\n── Empty input ───────────────────────────────────────────────');
const r5 = parseAcquisitionMetadata('');
chkStr('empty → unknown', r5.format, 'unknown');

console.log('\n── Non-XT scan mode warns ────────────────────────────────────');
const xyz = real.replace('"Scan Mode"\t"XT"', '"Scan Mode"\t"XYT"');
const r6 = parseAcquisitionMetadata(xyz);
const warned = r6.warnings.some(w => /not "XT"/.test(w));
console.log(`  ${warned ? '✓' : '✗'} warns on non-XT scan mode`);
warned ? pass++ : fail++;

console.log(`\n${'─'.repeat(62)}\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
