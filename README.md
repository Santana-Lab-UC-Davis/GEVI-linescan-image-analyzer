# GEVI Linescan Analyzer

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.8.1-informational.svg)](CHANGELOG.md)
[![Tests](https://img.shields.io/badge/tests-69%20assertions%20passing-brightgreen.svg)](#unit-tests)

A single-file browser application for analysing two-photon line-scan recordings of
genetically encoded voltage indicator (GEVI) signals, developed for ASAP5 imaging of
sinoatrial node pacemaker myocytes in intact ex vivo preparations.

The tool takes raw line-scan images, extracts and corrects fluorescence traces, detects
action potentials and subthreshold voltage fluctuations, and computes a set of
population-level synchrony, regularity and noise metrics. It ships with a seeded
synthetic-data validation harness so that detection performance can be reproduced and
audited independently of any experimental dataset.

**Version:** 1.8.1 · **License:** GPL-3.0 · **Requires:** a desktop web browser, nothing else

> Research software. Not a medical device. Not for diagnostic use.

---

## Quick start

1. Download [`GEVI_linescan_analyzer_v1_8_1.html`](GEVI_linescan_analyzer_v1_8_1.html).
   On GitHub use the **Download raw file** button rather than copying from the preview.
2. Open it in a current desktop browser (Chrome, Edge, Firefox or Safari) by
   double-clicking it, or drag it onto a browser window.
3. Drag a line-scan image onto the drop zone, together with its Olympus `.txt` sidecar if
   you have one, or press **Generate Demo** to explore the interface without any data.

There is nothing to install. No build step, no package manager, no server, no account.

[`USER_GUIDE.md`](USER_GUIDE.md) is the practical walkthrough: the standard workflow, which
parameters matter and how to tell when one is set wrong, how to read the noise and
stochastic-resonance outputs, and a troubleshooting table for the common failure modes.
Read it before analysing real data. Two settings in particular, the sensor polarity and the
acquisition calibration, will silently produce wrong numbers if they are wrong.

### Offline and private by construction

The application is a single HTML file with no external dependencies, no CDN references
and no network calls of any kind. Images are read locally through the browser File API
and never leave the machine. Browser storage is used only for small interface preferences:
`sessionStorage` holds the recording identifiers and which panels are expanded,
`localStorage` holds the population amplitude threshold. No image or trace data is ever
stored. The file can be run with the network disabled, and it can be archived alongside
data as a self-contained record of the analysis environment.

### Inputs

| Input | Formats | Notes |
| --- | --- | --- |
| Line-scan image | `.tif`, `.tiff`, `.jpg`, `.jpeg`, `.png` | TIFF is parsed directly, including multi-channel and non-8-bit data |
| Acquisition metadata | `.txt` | Optional; Olympus FluoView sidecar, pre-fills pixel size and line period |

The expected convention is **rows = time, columns = space**.

Animal ID, condition and region are pre-filled from the source filename where the filename
follows a recognised pattern. Values are only inferred when a token matches a known
vocabulary; nothing is guessed when there is no match.

### Outputs

`SR_data.csv`, `events.csv`, `phaseTiming.csv`, `roi_traces.csv`, `sigma_partition.csv`,
`diastolic_ramp_windows.csv`,
`validation_report.html`, plus JSON equivalents and a single flat summary row per recording
for stacking across recordings. **Generate and download all reports** runs any missing
prerequisite analysis and then writes the full set with a shared filename stem.

Figures export as a composite multi-panel SR report PNG, plus standalone PNGs of the F/F0
image, the F/F0 image with the detection mask overlaid, the F/F0 scale bar, and the ROI
trace plot.

---

## What it computes

**Preprocessing.** ROI extraction with adjustable bounds; photobleach correction by rolling
percentile (default), mono-exponential or bi-exponential fit; F/F0 conversion with
sensor-appropriate polarity, so that for negative-polarity indicators such as ASAP5, F0 is
taken from the brightest (diastolic) frames and the output is 1−F/F0, and depolarisation is
positive in both conventions; optional spatial filtering (median, mean, bilateral, minimum,
maximum) with an undo history; optional subthreshold detrending by rolling median or
Savitzky-Golay.

**Event detection.** Dual-polarity detection: fluorescence decreases and increases are
thresholded in separate passes on a z-scored image, followed by morphological opening,
connected-component labelling and a sigmoid compound score combining event size and
brightness. Events are then separated into full action potentials and subthreshold voltage
fluctuations at an amplitude boundary located automatically as the valley between the two
amplitude populations in a smoothed histogram, falling back to an Otsu-seeded midpoint when
the distribution is not convincingly bimodal. The boundary can also be dragged manually or
fixed to a population-wide value. The last of these matters when comparing recordings, since
a per-recording automatic threshold makes downstream metrics non-comparable.

**Kinetics and classification.** Rise time, decay time, FWHM, amplitude tiers, and
per-column classification into periodic, irregular and silent modes using the
irregularity-score approach of Telgkamp et al. (2002) and Zanella et al. (2014). The CV
cutoff (default 0.10) and the minimum action-potential count (default 3) that define this
classification are exposed as explicit, exported settings rather than implicit constants.

> The application labels the no-action-potential class **silent**. Manuscripts from this
> laboratory report the same class as **non-firing**, since some such columns still produce
> subthreshold fluctuations. The two terms refer to the same category.

**Synchrony and rhythm.** Kuramoto order parameter R(t) with configurable baseline and
synchrony thresholds; inter-column coherence; spatial autocorrelation and lag maps;
conduction velocity; leader stability; conditional firing; phase timing.

Conduction velocity is computed from activation times on the spatial-mean trace, with a
prominence gate scaled to the observed amplitude range rather than a fixed threshold. When
the mean recovered activation spread approaches the look-back window, the sequence was
truncated and the reported CV is an overestimate; those recordings are flagged
`spreadSaturated` rather than reported as measurements. Check that flag before using CV.

The shuffled-surrogate controls are seeded, so repeated runs on the same recording are
bit-identical.

**Noise and spectra.** Subthreshold noise σ measured in fixed-length, fixed-phase diastolic
windows (default 100 ms, ending 20 ms before the next action potential) with the linear ramp
removed, so that σ is comparable across firing rates; power spectral density with a 1/f^β
fit, and a rate-matched refit over a band anchored to the beat frequency (default 2× to 20×
f_beat) with the beat peak and its first four harmonics notched.

**Variance partition.** `sigmaPartitionCore()` splits the measured subthreshold σ into the
part attributable to detected events and the remaining continuous component, and reports the
variance fraction. A fraction near 1 means σ is essentially all detected-event variance; a
fraction well below 1 means σ is dominated by sub-detection fluctuation and the slow
correlated component, and should be described as reporting the continuous subthreshold trace
rather than subthreshold-fluctuation activity. The distinction matters whenever σ is used as
the independent variable of a stochastic-resonance analysis.

**Diastolic ramp slope.** The least-squares ramp fitted inside each rate-controlled
diastolic window yields a slope as well as residuals. That slope is the diastolic
depolarisation rate, the pacemaker drive itself, and it is exported per window, per column
and per recording in signal units per second, with R², sample count and window bounds.
Windows dropped by the loop are counted by reason rather than vanishing: short diastoles
cost windows, so fast-firing cells and rate-raising drug conditions lose them
non-randomly, and the counts must be reportable alongside the slopes.

**Regularity.** Inter-event interval CV, irregularity score, and Poincaré descriptors SD1,
SD2 and SD1/SD2.

**Entropy.** Shannon, permutation and sample entropy of the diastolic signal.

**Controls.** Shuffled-surrogate controls for the phase-timing analysis: fluctuation phases
are permuted to build a null distribution of AP latency per phase bin, reported with a 95%
confidence interval against the observed values.

Downstream population modelling, including inverted-U fits and mixed-effects models, is
deliberately out of scope for the browser tool and belongs in R or Python. The exported flat
summary row is the intended input to those models.

### Attribution and derived code

**The detection engine is a derived work of [SparkMaster 2](https://github.com/jtmff/SparkMaster2),**
Copyright (C) 2023 Jakub Tomek, licensed under GPL-3.0.

> Tomek J, et al. SparkMaster 2: A New Software for Automatic Analysis of Calcium Spark
> Data. *Circ Res.* 2023. doi:[10.1161/CIRCRESAHA.123.322847](https://doi.org/10.1161/CIRCRESAHA.123.322847)

Adapted from SparkMaster 2: the nine-step segmentation sequence; the two-pass
mean + 1.75 SD clipped column and row normalization; the sigmoid size-and-brightness
compound scoring; and the object-splitting step. These were reimplemented in JavaScript.

Modified in this work: extension to two symmetric polarity passes, so that both
fluorescence decreases and increases are detected without sensor-specific tuning; retuning
of every default for genetically encoded voltage indicator data rather than calcium sparks;
and classification of events into action potentials and subthreshold voltage fluctuations.

Original to this work: everything downstream of detection, including amplitude
classification, Kuramoto synchrony, rate-controlled noise, rate-matched spectral fitting,
the variance partition, regularity and Poincaré descriptors, the entropy measures, phase
timing, shuffled controls, and the seeded validation harness.

Because the detection engine is derived from GPL-3.0 code, this software is distributed
under GPL-3.0. Jakub Tomek was consulted before release and supported it.

### Other third-party code

None. Beyond the SparkMaster 2 lineage described above, every numerical routine is
implemented inside the file, including TIFF decoding, the discrete Fourier transform, Otsu
thresholding, Savitzky-Golay coefficient generation, the two-dimensional filters, rolling
percentile and rolling median estimators, bi-exponential fitting, a seeded linear
congruential generator, and the entropy estimators. There are no runtime dependencies, no
package manager, and no network calls.

---

## Validation

`generateValidationImage()` synthesises a line-scan image with a fixed random seed, planting
action potentials, subthreshold fluctuations and debris at known times and amplitudes.
`runValidation()` matches planted against detected events and reports per-class precision,
recall and F1, together with the Kuramoto R recovered from detected events against the value
implied by the planted phase offsets. `validation_report.html` is a self-contained record of
a validation run.

Because the generator is seeded (seed 42), any user can reproduce the reported detection
performance exactly, on any machine, without access to the experimental data.

The engine's validated operating range is **AP amplitude ≥ 0.50 ΔF/F0 and SNR ≥ 8**, where it
achieves 100% sensitivity and 98.4% precision. Outside that range, verify detections by eye.

### Unit tests

The repository ships four test files covering the numerical routines that are hardest to
verify by eye. They require Node.js (v18 or later) and nothing else: no package manager, no
dependencies, no configuration.

```
node run_tests.js                  # all four, with a combined total

node test_filename_parser.js       # recording-identifier parsing from source filenames
node test_metadata_parser.js       # Olympus FluoView .txt sidecar parsing
node test_regularity_poincare.js   # CV-IEI, irregularity score, Poincaré SD1/SD2
node test_rate_control_e2e.js      # rate-controlled σ and rate-matched β, end to end
```

Run them from the directory containing the analyzer HTML file. All four pass on the released
version: 69 assertions in total (23 + 17 + 22 + 7).

The tests do not duplicate the analyzer's code. `extract_functions.js` lifts the functions
out of the HTML file by name at run time, so the tests always exercise the shipped
implementation rather than a copy that could drift from it. It locates the analyzer by
filename pattern, so a version bump does not break the tests; set the `GEVI_ANALYZER`
environment variable to a path to override the choice.

The end-to-end test is the substantive one. It builds two synthetic recordings with
*identical* true subthreshold noise that differ only in firing rate, and checks that the
rate-controlled σ estimate collapses the discrepancy between them, from 96% on the
uncorrected measure to under 1%. That is the specific bias the correction exists to remove,
so the test states the result numerically rather than asserting that it works.

---

## Licensing

Released under the **GNU General Public License v3.0** (SPDX identifier `GPL-3.0-or-later`).
The full text is in [`LICENSE`](LICENSE).

Copyright (C) 2026 The Regents of the University of California.
Portions Copyright (C) 2023 Jakub Tomek, see [Attribution](#attribution-and-derived-code).

In brief: use, modification and redistribution are permitted for any purpose, commercial or
noncommercial, provided that derived works are also distributed under GPL-3.0, that the
source is made available, and that modifications are marked as such. The software is
provided as is, without warranty.

GPL-3.0 rather than a permissive license because the detection engine derives from
SparkMaster 2, which is GPL-3.0. Copyleft propagates. This is an OSI-approved open source
license, it complies with the Open Source Definition, and it is named explicitly among the
licenses eLife accepts.

---

## Citing this software

If you use this tool, please cite both the paper and the archived software release:

> «AUTHORS». «TITLE». «JOURNAL» «YEAR». doi:«PAPER DOI»

> Santana LF, Muñoz M. GEVI Linescan Analyzer (version 1.8.1) [Software]. Zenodo. doi:«ZENODO DOI»

Please also cite SparkMaster 2, from which the detection engine derives:

> Tomek J, et al. SparkMaster 2: A New Software for Automatic Analysis of Calcium Spark Data. Circ Res. 2023. doi:10.1161/CIRCRESAHA.123.322847

Machine-readable metadata is in [`CITATION.cff`](CITATION.cff); GitHub renders it as a
"Cite this repository" button once the repository is public.

When reporting results, state the tool version, the sensor, ms/line and µm/pixel, the
photobleach method and its parameters, the z-score threshold, the AP-threshold mode and its
value, and whether detrending was enabled. All of these are written into the `parameters`
block of the JSON and CSV exports, so archiving one export with your figures captures the
full parameter state without transcription.

---

## Development note

Portions of this software were drafted with the assistance of a large language model.
All code was reviewed, tested and validated by the authors, who take full responsibility
for its correctness. The seeded validation harness and the unit test suite described above
exist in part to make that verification reproducible by third parties.

---

## Contributing and support

Bug reports, questions and feature requests belong in the
[issue tracker](https://github.com/Santana-Lab-UC-Davis/GEVI-linescan-image-analyzer/issues).
[`CONTRIBUTING.md`](CONTRIBUTING.md) describes what a useful bug report contains and the
conventions a pull request should follow.

This is research software maintained by a working laboratory alongside its primary research.
Support is best effort, and there is no service-level commitment.

## Funding

Supported by National Heart, Lung, and Blood Institute (NHLBI) grant HL168874 to L.F.S.

## Authors and contact

L. Fernando Santana and Manuel Muñoz, Department of Physiology and Membrane Biology,
University of California, Davis, School of Medicine.

Correspondence: L. Fernando Santana.
