# Changelog

All notable changes to the GEVI Linescan Analyzer are recorded here. The version
number is carried in the analyzer's filename and in the `APP_VERSION` constant,
which drives the window title, the header badge and the version stamps written
into every export.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
loosely and uses simple incrementing minor versions rather than strict semantic
versioning, since the deliverable is a single self-contained application rather
than a library with an API surface.

## [1.8.1] — 2026-08-22

**Version of record for the accompanying manuscript.** Export key-name fixes. No
computation changed: the detection engine, `ImageProcessor` and every analysis
routine are untouched, and all 69 test assertions pass. CSV exports and the
on-screen plots were already correct and are unaffected.

### Fixed
- **Three JSON fields serialised as empty arrays.** The writer requested key names
  the compute functions do not return, and a `|| []` fallback swallowed the
  mismatch: the Kuramoto R(t) series (written `rTimeSeries`, returned `R`), the
  spatial autocorrelation curve (written `lags`/`values`, returned `rho`), and the
  noise-regularity noise axis (written `noise`, returned `noiseAmplitude`).
  `fitCoeffs` likewise did not match the returned `fitParams`. **Any JSON exported
  with v1.8 or earlier is missing these fields and should be regenerated.**
- The autocorrelation block now also carries `lags_um`, `nFrames`, `maxLagPx` and
  the detrended λ.
- **A reported inverted-U fit R² was never computed.** It appeared in the text
  summary and in two JSON fields, where `|| 0` printed 0.000 on every recording.
  The claim has been removed rather than back-filled: introducing a newly derived
  statistic would require its own validation.

## [1.8] — 2026-08-18

Superseded by v1.8.1 before public release. Correctness fixes found in
testing. Detection and image processing remain byte-identical to v1.6. Subthreshold
σ, spectral β, regularity, Poincaré and entropy outputs are unchanged from v1.7,
verified by diffing the end-to-end rate-control test across both versions. Conduction
velocity, the shuffled controls and, in one failure mode, amplitude classification do
change; see below.

### Fixed
- **Amplitude classification no longer returns early when the connected-component
  pass yields no events.** Threshold determination falls back to per-column events a
  few lines later, so the early return left `histApThresh` null and every event was
  read downstream as subthreshold. Affects any recording where the CCL pass returned
  nothing but per-column detection returned events.
- **Conduction velocity prominence gate.** The fixed 0.5 ΔF/F0 gate is unreachable on
  the spatial-mean trace: single-column GEVI SAN action potentials are 0.05 to 0.35
  ΔF/F0, and averaging across columns with a finite activation spread smears the mean
  below the single-column peak. The gate now scales to the observed spatial-mean
  amplitude range, with an absolute floor for flat traces.
- **Activation-spread saturation is now reported.** When the mean recovered spread
  approaches the look-back window width the sequence was truncated and CV is an
  overestimate of unknown size. A `spreadSaturated` flag marks these rather than
  letting the value be read as a measurement. Widening the window is not a fix: it
  lets the dF/dt search wander into the previous upstroke.
- **Analysis re-entrancy defers instead of dropping.** Dropping left the displayed
  results computed under the previous parameter values with no on-screen indication.
  `runEntrainmentAnalysis` likewise retries rather than returning, which previously
  left `state.entrainmentResults` null with no error and no status message.
- **Validation harness plants wider action potentials** (Gaussian σ 5 → 8 frames). At
  2 ms per frame the old width gave FWHM ≈ 24 ms, below the 30 ms gate in the
  entrainment path, so `detectAPsPerColumn` recovered under 20% of planted events and
  the harness exercised only the amplitude-classification route.

### Changed
- `computeShuffledControls` is seeded (default 20260818), replacing `Math.random()`.
  This was the last non-reproducible output in the tool; repeat runs are now
  bit-identical. Values differ from v1.7 by construction.
- Per-column detrended and rate-controlled σ are exported in the SR JSON. Previously
  only the scalar means were written, so neither could be reproduced from the
  deposited file.

### Unchanged
- `GEVIDetectionEngine` and `ImageProcessor` are byte-identical to v1.6.
- σ, β, firing rate, regularity, Poincaré and entropy outputs are identical to v1.7.
- All 69 test assertions pass.

## [1.7] — 2026-08-17

Superseded by v1.8 before public release.

### Added
- Diastolic ramp slope is retained and exported. The least-squares ramp fitted
  inside each rate-controlled diastolic window already produced a slope; through
  v1.6 it was discarded and only the residuals were kept. That slope is the
  diastolic depolarisation rate, the pacemaker drive, and it is now exported per
  window, per column and per recording in signal units per second (the per-frame
  value is kept beside it), with R², sample count and window bounds.
  `<stem>_diastolic_ramp_windows.csv` is the per-window export.
- Windows dropped by the rate-control loop are counted by reason instead of
  vanishing silently. Short diastoles cost windows, so fast-firing cells and
  rate-raising drug conditions lose them non-randomly; the counts must be
  reportable alongside the slopes.
- `runRateControlRegressionCheck()`, asserting that pre-existing σ outputs are
  bit-identical to v1.6 against a frozen copy of the v1.6 computation.

### Changed
- `extract_functions.js` can now lift top-level `const` declarations as well as
  functions, so a routine that depends on a module-level constant is testable.
  Needed because the ramp-slope code introduced `RC_SLOPE_UNITS` and
  `RC_SLOPE_POLARITY`.
- The two tests that exercise `computeRateControlledNoise` now also request
  `rcMedian`, `rcMAD`, `RC_SLOPE_UNITS` and `RC_SLOPE_POLARITY`, which the v1.7
  implementation depends on.
- Version stamps in the new ramp-slope export derive from `APP_VERSION`.

### Unchanged
- The detection engine and image-processing classes are byte-identical to v1.6.
- All σ and β outputs are numerically identical to v1.6, verified independently
  by running the end-to-end rate-control test against both versions on the same
  synthetic input and diffing the results.

## [1.6] — 2026-08-06

First public release. Versions 1.1 through 1.6 below were developed before
public release and are listed for completeness, since the exports produced
during the study carry these version stamps.

The license was changed from BSD-3-Clause to GPL-3.0 before release. The
detection engine derives from SparkMaster 2, which is GPL-3.0, so copyleft
propagates. Jakub Tomek was consulted and supported the release.

### Added
- GPL-3.0 license, copyright notices and AI-assistance disclosure in the
  analyzer source header.
- Attribution of the detection engine to SparkMaster 2 (Tomek J et al.,
  Circ Res 2023), with the modification notice required by GPL-3.0 section 5(a).
- Appropriate Legal Notices in the interface, as required by GPL-3.0 section
  5(d): copyright, warranty disclaimer, license and derivation, shown under the
  application title.
- `run_tests.js`, a dependency-free runner for the four test files.

### Changed
- `extract_functions.js` now locates the analyzer by filename pattern rather
  than by a hardcoded literal name, so a version bump no longer breaks the test
  suite. `GEVI_ANALYZER` overrides the choice.
- The version stamps written into the amplitude-distribution and ROI-trace
  exports, the validation report and the SR data now derive from `APP_VERSION`
  instead of being hardcoded, so a version bump cannot leave stale strings.
- The window title and header badge are re-synced from `APP_VERSION` at load.

### Fixed
- Hang on clearing ROIs: runaway guards moved inside event formatting,
  oversized background components skipped, the cost estimate now predicts the
  full-frame fallback, and clearing the last ROI asks for confirmation.

## [1.5]

### Added
- A "please wait" overlay for every analysis, detection and partition run, with
  a minimum display time so it never flashes.

## [1.4]

### Changed
- The detrend control is a full-size, full-row click target, and its recompute
  is deferred so the control repaints immediately.

## [1.3]

### Changed
- The σ partition report leads with the variance percentages, and explains
  itself when no diastolic windows are available rather than returning an empty
  result.

## [1.2]

### Changed
- Performance and robustness: flat-queue flood fill (~13× faster, output
  verified identical), runaway-detection guard, analysis cost guard, progress
  overlay with cooperative yielding, and error handling on both analysis entry
  points.

## [1.1]

### Added
- σ partition module, separating event-driven from continuous variance in the
  measured subthreshold noise.

## [1.0]

Initial internal release: detection engine, amplitude classification,
synchrony and entrainment analysis, subthreshold noise and spectral measures,
regularity and Poincaré descriptors, entropy measures, shuffled-surrogate
controls, the seeded validation harness, and the full export set.
