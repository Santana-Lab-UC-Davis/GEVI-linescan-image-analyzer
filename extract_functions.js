// Shared test helper: pull named top-level functions verbatim out of the
// single-file analyzer so they can be unit-tested in Node.
//
// The analyzer is one self-contained HTML file with no module system, which is
// deliberate (it must run by double-clicking, offline, with no build step).
// That leaves no export surface, so the tests read the source and lift the
// functions out by name. Extracting rather than duplicating means the tests
// always exercise the shipped code, not a stale copy of it.

const fs = require('fs');
const path = require('path');

// The analyzer filename carries its version, so it changes on every release.
// Matching a pattern rather than a literal name means the tests keep working
// after a version bump, instead of failing in a way that looks like a code
// regression. If several versions sit side by side the highest one wins; set
// the environment variable GEVI_ANALYZER to choose explicitly.
const ANALYZER_PATTERN  = /^GEVI[_ ]linescan[_ ]analyzer[_ ]v[\d._]+\.html$/i;
const ANALYZER_FILENAME = 'GEVI_linescan_analyzer_v<version>.html';

// "v1_6" / "v1.6" -> [1, 6], so candidates can be ordered.
function versionKey(name) {
    const m = name.match(/v([\d._]+)\.html$/i);
    return m ? m[1].split(/[._]/).map(Number) : [0];
}

function byVersionDescending(a, b) {
    const ka = versionKey(a), kb = versionKey(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
        const d = (kb[i] || 0) - (ka[i] || 0);
        if (d) return d;
    }
    return 0;
}

function analyzerPath() {
    if (process.env.GEVI_ANALYZER) {
        const p = path.resolve(process.env.GEVI_ANALYZER);
        if (!fs.existsSync(p)) {
            throw new Error(`GEVI_ANALYZER points at "${p}", which does not exist.`);
        }
        return p;
    }
    // Look next to this file first, then one directory up.
    for (const dir of [__dirname, path.join(__dirname, '..')]) {
        let entries;
        try { entries = fs.readdirSync(dir); } catch { continue; }
        const hits = entries.filter(n => ANALYZER_PATTERN.test(n)).sort(byVersionDescending);
        if (hits.length) return path.join(dir, hits[0]);
    }
    throw new Error(
        `Could not find the analyzer HTML file (expected a name matching ` +
        `"${ANALYZER_FILENAME}"). Run the tests from the directory containing ` +
        `the analyzer, place them alongside it, or set GEVI_ANALYZER to its path.`);
}

// Grab `function <name>(...) { ... }` by brace-matching at the declaration's
// own indent level. The analyzer indents all top-level functions consistently,
// so the closing brace is the first line at that indent that is exactly "}".
function extractFunction(source, name) {
    const needle = 'function ' + name;
    const i = source.indexOf(needle);
    if (i === -1) throw new Error(`Function "${name}" not found in the analyzer source.`);
    const lineStart = source.lastIndexOf('\n', i) + 1;
    const indent = i - lineStart;
    const lines = source.slice(i).split('\n');
    const out = [lines[0]];
    for (let k = 1; k < lines.length; k++) {
        out.push(lines[k]);
        const ln = lines[k];
        if (ln.trim() === '}' && (ln.length - ln.trimStart().length) === indent) {
            return out.join('\n');
        }
    }
    throw new Error(`Unbalanced braces while extracting "${name}".`);
}

// Grab a top-level `const <NAME> = ...;` declaration, including multi-line
// values. Some routines depend on module-level constants rather than only on
// other functions (RC_SLOPE_UNITS, for example), and those cannot be lifted by
// extractFunction. Terminates on the first line ending in `;` at or after the
// declaration whose brackets are balanced, which covers scalars, template
// literals, arrays and object literals as they are written in the analyzer.
function extractConst(source, name) {
    const re = new RegExp('^([ \\t]*)const\\s+' + name + '\\s*=', 'm');
    const m = re.exec(source);
    if (!m) throw new Error(`Const "${name}" not found in the analyzer source.`);
    const lines = source.slice(m.index).split('\n');
    let depth = 0;
    const out = [];
    for (const ln of lines) {
        out.push(ln);
        for (const ch of ln) {
            if ('([{'.includes(ch)) depth++;
            else if (')]}'.includes(ch)) depth--;
        }
        if (depth <= 0 && ln.trimEnd().endsWith(';')) return out.join('\n');
    }
    throw new Error(`Unterminated declaration while extracting const "${name}".`);
}

// Returns one JS source string defining all requested names. A name is treated
// as a const if it is not found as a function, so callers can list functions
// and constants together without caring which is which.
function extractFunctions(names) {
    const src = fs.readFileSync(analyzerPath(), 'utf8');
    return names.map(n => {
        try { return extractFunction(src, n); }
        catch (e) {
            if (!/not found/.test(e.message)) throw e;
            return extractConst(src, n);
        }
    }).join('\n\n');
}

module.exports = {
    extractFunctions, extractFunction, extractConst, analyzerPath, ANALYZER_FILENAME
};
