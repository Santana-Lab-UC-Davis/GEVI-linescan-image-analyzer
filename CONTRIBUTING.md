# Contributing

Thank you for looking at this. A few notes on what is useful and what this
project is trying to stay.

## What this project is

The analyzer is a single self-contained HTML file that runs by double-clicking,
offline, with no build step, no package manager and no third-party code. That
constraint is deliberate, not an accident of how it grew:

- It runs on an acquisition machine that has no network access and on which
  nobody is permitted to install software.
- It can be archived alongside the data as a complete record of the analysis
  environment, and will still run years later.
- There are no inbound license obligations and no dependency-compatibility
  questions to reconcile.

Contributions that introduce a bundler, a package manifest, a runtime
dependency or a CDN reference will not be merged, however much cleaner the
result would be. Everything numerical is implemented in the file from first
principles, and new numerical work should be too.

## Reporting a bug

Open an issue. A report that lets us reproduce the problem contains:

1. The analyzer version (the badge next to the title, or `APP_VERSION` in the
   source).
2. Browser and operating system, with versions.
3. What you did, what you expected, and what happened instead.
4. The acquisition calibration in force: ms/line and µm/pixel, and whether they
   came from a sidecar, from TIFF metadata, or were typed in.
5. Whichever export is relevant, ideally `SR Data (JSON)`. Its `parameters`
   block captures the full parameter state, which saves a long exchange
   reconstructing it.
6. Any errors in the browser console (F12, or Cmd-Option-I on macOS).

Please do not attach unpublished experimental recordings to a public issue. If
the bug depends on a specific image, say so and we will find a private route,
or check whether **Generate Validation Image** reproduces it.

Before reporting a detection problem, check the two settings that cause most of
them: the sensor polarity, and whether **▶ Run Detection** was clicked since the
image was loaded. The troubleshooting table in
[`USER_GUIDE.md`](USER_GUIDE.md#6-troubleshooting) covers the rest.

## Proposing a change

Open an issue describing the problem before opening a pull request, especially
for anything that touches the detection engine or a published metric. Numbers in
the manuscript were produced by this code, so a change to a computation is a
change to a result, and needs to be discussed rather than merged.

If you do send a pull request:

- **Add a test.** The four files in the repository run under Node.js with no
  dependencies. `extract_functions.js` lifts functions out of the HTML by name,
  so a test exercises the shipped code rather than a copy. Follow that pattern.
- **Run the suite.** `node run_tests.js` from the directory holding the analyzer.
  All 69 assertions must pass.
- **Run the validation harness.** Generate a validation image and confirm the
  per-class precision, recall and F1 have not moved. The seed is fixed, so any
  change in those numbers is real.
- **Bump `APP_VERSION`** and add a `CHANGELOG.md` entry. The filename carries the
  version too, so rename the HTML file to match.
- **Match the surrounding style.** Four-space indent, top-level functions at a
  consistent indent (the test extractor depends on this), and comments that
  explain why a choice was made rather than restating what the line does.

## Scope

Population-level statistical modelling — inverted-U fits, mixed-effects models,
anything requiring proper model diagnostics — is deliberately out of scope and
belongs in R or Python. The exported flat summary row is the intended handoff.

## License

Contributions are accepted under the GNU General Public License v3.0 that
covers the project. See [`LICENSE`](LICENSE).

Note that the detection engine is a derived work of SparkMaster 2 (GPL-3.0).
Changes to it must preserve the existing copyright and modification notices, and
any redistribution of this software or a derivative must remain under GPL-3.0.
