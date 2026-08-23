// Prototype + tests for recording-metadata filename parsing  .
// Grounded in the actual naming used in the Munoz-Camus SAN dataset.

// ---- vocabulary -----------------------------------------------------------
// Condition tokens are matched against a KNOWN vocabulary rather than "first
// hyphen token". In this dataset "ASAP5" appears as a hyphen token in 76 files
// and "60x" in most of them -- both are sensor/optics, not conditions. A
// positional parser would mislabel the majority of the corpus.
const CONDITION_ALIASES = [
    [/^base(line)?$/i,            'Baseline'],
    [/^(ctrl|control)$/i,         'Baseline'],
    [/^iso(proterenol)?\d*$/i,    'Isoproterenol'],
    [/^iva(bradine)?\d*$/i,       'Ivabradine'],
    [/^bleb(bistatin)?\d*$/i,     'Blebbistatin'],
    [/^pip2$/i,                   'PIP2'],
    [/^pip₂$/i,                   'PIP2']
];
// Tokens that are never conditions (sensor, optics, acquisition/crop artifacts)
const NON_CONDITION = [
    /^asap\d*$/i, /^\d+x$/i, /^\d+$/i, /^\d+_\d+$/i, /^area\d*$/i,
    /^box$/i, /^\d+_box$/i, /^photo$/i, /^whole\s*cell$/i, /^cell\s*\d*$/i,
    /^\d+x\d+$/i, /^t\d+$/i
];

function parseRecordingMetaFromFilename(fileName) {
    const out = { animalId: '', condition: '', region: '', matched: {} };
    if (!fileName) return out;

    // strip directory + extension
    let base = String(fileName).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    const tokens = base.split(/[-_]+/).filter(Boolean);
    if (!tokens.length) return out;

    // --- region + animal from the leading stem -----------------------------
    // Requires SAN to FOLLOW the region letter, so a bare "SAN-..." is not
    // misread as Superior via the S of SAN.
    const stem = tokens[0];
    // Case-insensitive overall; region is decided from the CAPTURED letter, so
    // "SSAN2b", "sSAN2b" and "ssan2B" all resolve identically.
    const m = stem.match(/^([SI])SAN(\d+[A-Za-z]?)?$/i);
    if (m) {
        out.region = /^[Ss]$/.test(m[1]) ? 'Superior' : 'Inferior';
        out.matched.region = stem;
        if (m[2]) { out.animalId = 'SAN' + m[2].toUpperCase(); out.matched.animalId = stem; }
        // no digits => animal not identifiable from the name; leave blank
    } else {
        // Fall back: a bare SAN<digits> stem gives animal but no region
        const m2 = stem.match(/^SAN(\d+[A-Za-z]?)$/i);
        if (m2) { out.animalId = 'SAN' + m2[1].toUpperCase(); out.matched.animalId = stem; }
    }

    // --- condition from the known vocabulary -------------------------------
    for (let i = 1; i < tokens.length; i++) {
        const tok = tokens[i];
        if (NON_CONDITION.some(rx => rx.test(tok))) continue;
        for (const [rx, canon] of CONDITION_ALIASES) {
            if (rx.test(tok)) { out.condition = canon; out.matched.condition = tok; break; }
        }
        if (out.condition) break;
    }
    // Deliberately NOT defaulting to "Baseline" when no token matches: in this
    // dataset an absent suffix usually means baseline, but inferring it would
    // silently mislabel any recording whose condition is simply not in the name.
    return out;
}

// ---- tests ----------------------------------------------------------------
let pass = 0, fail = 0;
const t = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) console.log(`      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
};
const P = f => { const r = parseRecordingMetaFromFilename(f); return [r.region, r.animalId, r.condition]; };

console.log('\n── Real filenames from the dataset ─────────────────────────────');
t('SSAN2b-Baseline.tif',        P('SSAN2b-Baseline.tif'),        ['Superior', 'SAN2B', 'Baseline']);
t('SSAN5-Iso.tif',              P('SSAN5-Iso.tif'),              ['Superior', 'SAN5',  'Isoproterenol']);
t('ISAN2.tif',                  P('ISAN2.tif'),                  ['Inferior', 'SAN2',  '']);
t('ISAN1B-Iva.oir',             P('ISAN1B-Iva.oir'),             ['Inferior', 'SAN1B', 'Ivabradine']);
t('ISAN6C-Iva.oir',             P('ISAN6C-Iva.oir'),             ['Inferior', 'SAN6C', 'Ivabradine']);
t('iSAN-ASAP5-60x-8.tif (lowercase i, no animal digits)',
                                P('iSAN-ASAP5-60x-8.tif'),       ['Inferior', '',      '']);
t('sSAN-60X-14.oir (lowercase s)',
                                P('sSAN-60X-14.oir'),            ['Superior', '',      '']);
t('SSAN-60X-1_0001.oir',        P('SSAN-60X-1_0001.oir'),        ['Superior', '',      '']);

console.log('\n── The ASAP5 trap: sensor token must not become a condition ────');
t('SAN-ASAP5-60x-Blebbistatin.oir → Blebbistatin, no region',
                                P('SAN-ASAP5-60x-Blebbistatin.oir'), ['', '', 'Blebbistatin']);
t('bare SAN- prefix is NOT read as Superior',
                                parseRecordingMetaFromFilename('SAN-ASAP5-60x-Bleb.oir').region, '');
t('iSAN-ASAP5-60x-8 condition stays empty (ASAP5 rejected)',
                                parseRecordingMetaFromFilename('iSAN-ASAP5-60x-8.tif').condition, '');

console.log('\n── Alias normalisation ────────────────────────────────────────');
t('Iso3 → Isoproterenol',       P('SSAN3-Iso3.oir'),             ['Superior', 'SAN3', 'Isoproterenol']);
t('Iva → Ivabradine',           P('ISAN4-Iva.oir'),              ['Inferior', 'SAN4', 'Ivabradine']);
t('Bleb → Blebbistatin',        P('SSAN7-Bleb.oir'),             ['Superior', 'SAN7', 'Blebbistatin']);
t('Control → Baseline',         P('SSAN9-Control.tif'),          ['Superior', 'SAN9', 'Baseline']);
t('PIP2 recognised',            P('ISAN3-PIP2.tif'),             ['Inferior', 'SAN3', 'PIP2']);
t('case-insensitive: ssan2B-BASELINE',
                                P('ssan2B-BASELINE.tif'),        ['Superior', 'SAN2B', 'Baseline']);

console.log('\n── Non-matching / degenerate input ────────────────────────────');
t('unrelated name yields nothing', P('2d heart vnelson.tiff'),   ['', '', '']);
t('empty string',                  P(''),                        ['', '', '']);
t('null-safe',                     P(null),                      ['', '', '']);
t('validation image name',         P('validation_seed42.tif'),   ['', '', '']);
t('Olympus confocal example',      P('CM_Cell in Gel_Fluo4_10%PVA_0.5Hz_cell 03.txt'), ['', '', '']);
t('path is stripped',              P('/data/2026/SSAN2b-Iso.tif'), ['Superior', 'SAN2B', 'Isoproterenol']);

console.log(`\n${'─'.repeat(64)}\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
