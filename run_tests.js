#!/usr/bin/env node
// Run every test file in this directory and report a combined total.
//
// No dependencies and no test framework: each test file is a standalone Node
// script that prints its own results and exits non-zero on failure. This runner
// only sequences them and adds up the assertion counts, so the individual files
// remain runnable on their own.
//
//   node run_tests.js
//
// Run from the directory containing the analyzer HTML file, or set the
// GEVI_ANALYZER environment variable to its path.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { analyzerPath } = require('./extract_functions.js');

const TESTS = fs.readdirSync(__dirname)
    .filter(n => /^test_.*\.js$/.test(n))
    .sort();

if (!TESTS.length) {
    console.error('No test_*.js files found next to run_tests.js.');
    process.exit(1);
}

let analyzer;
try {
    analyzer = analyzerPath();
} catch (e) {
    console.error(e.message);
    process.exit(1);
}

console.log(`Analyzer under test: ${path.basename(analyzer)}\n`);

let passed = 0, failed = 0, broken = 0;

for (const t of TESTS) {
    let out;
    try {
        out = execFileSync(process.execPath, [path.join(__dirname, t)],
                           { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        broken++;
        console.log(`✗ ${t.padEnd(34)} did not complete`);
        console.log(String(e.stdout || '') + String(e.stderr || ''));
        continue;
    }
    const m = out.match(/Result:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
    if (!m) {
        broken++;
        console.log(`✗ ${t.padEnd(34)} no result line found`);
        continue;
    }
    const p = Number(m[1]), f = Number(m[2]);
    passed += p; failed += f;
    console.log(`${f ? '✗' : '✓'} ${t.padEnd(34)} ${p} passed, ${f} failed`);
}

console.log('\n' + '─'.repeat(60));
console.log(`TOTAL: ${passed} passed, ${failed} failed` +
            (broken ? `, ${broken} file(s) did not complete` : ''));

process.exit(failed || broken ? 1 : 0);
