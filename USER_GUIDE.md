# GEVI Linescan Analyzer — User Guide

**Version 1.8.1** · GEVI line-scan analysis for sinoatrial node voltage imaging

A single-file browser tool for quantifying action potentials (APs) and subthreshold voltage fluctuations (SVFs) in multiphoton line-scan recordings, with a Step 3 module for stochastic-resonance (SR) metrics: subthreshold noise, spectral slope, spatial coherence, and entropy.

> Research software. Not a medical device. Not for diagnostic use.
>
> Licensed under GPL-3.0. The detection engine is a derived work of
> [SparkMaster 2](https://github.com/jtmff/SparkMaster2) (Tomek J et al.,
> *Circ Res* 2023), reimplemented in JavaScript, extended to dual polarity and
> retuned for voltage-indicator data. See the README for full attribution.

**Contents.** [1 Getting started](#1-getting-started) · [2 Standard workflow](#2-standard-workflow) · [3 Parameters worth understanding](#3-parameters-worth-understanding) · [4 Reading the SR outputs](#4-reading-the-sr-outputs) · [5 Validating the tool](#5-validating-the-tool) · [6 Troubleshooting](#6-troubleshooting) · [7 Citation and reporting](#7-citation-and-reporting)

---

## 1. Getting started

**Requirements.** A modern desktop browser (Chrome, Firefox, Edge, or Safari). Nothing else — no Python, no MATLAB, no installation, no server.

**Running it.** Download `GEVI_linescan_analyzer_v1_8_1.html` and double-click it, or drag it onto a browser window. On GitHub, use the **Download raw file** button; copying text out of the file preview will not give you a working file. All computation happens locally in the browser; **no data is uploaded anywhere.** This also means the tool works offline and on an air-gapped acquisition machine.

**Input.** Drag your files onto the upload box, or click it to browse. Accepts TIFF (8/12/16-bit), PNG (8/16-bit), and JPG/other 8-bit formats. Convention: **rows = time, columns = space** (Y axis = time, X axis = distance along the scan line).

**Calibration.** Drop the Olympus FluoView `.txt` sidecar together with the image and µm/pixel and ms/line are set for you. Failing that, TIFF-embedded pixel metadata is read automatically; failing both, set the values by hand in **Acquisition Calibration**.

**Try it without data.** Click **Generate Demo** for a synthetic recording, or **Generate Validation Image** (Export & Tools) to run a ground-truth test with known planted events.

**A note on waiting.** Detection, entrainment analysis and the variance partition each show a progress overlay while they run, with a minimum display time so it cannot flash and disappear. A visible overlay means the tool is working, not stuck. Large ROIs on long recordings take the longest; the cost guard will warn you before starting a run it predicts will be slow.

---

## 2. Standard workflow

The tool has three conceptual stages. Stage 1 re-runs automatically whenever you change a parameter; stage 2 requires one button click; stage 3 then follows on its own.

### Step 1 — Load and pre-process (automatic)

1. **Drop your files.** Drag the line scan **and its Olympus `.txt` sidecar together** onto the upload box, or click the box to pick them. Dropping both at once is the recommended way to work: the image loads first, then the sidecar sets **ms / line** and **µm / pixel** automatically.

   You can also drop either one alone — an image by itself, or a sidecar later to calibrate an image already loaded.

2. **Confirm the scale.** Everything quantitative downstream — Hz, ms, µm, cm/s, σ, λ — is wrong if this is wrong, and nothing validates it. The status line under the upload box reports which values were applied and which metadata field each came from; glance at it. If no sidecar was loaded, you get a reminder to check the numbers by hand in the **Acquisition Calibration** panel.

   The parser reads `[Dimensions] X Dimension` for µm/pixel and derives ms/line from `[Image] Image Size(Unit Converted)` divided by the line count. It deliberately ignores `Sampling Speed`, which is per-pixel dwell time and excludes flyback — using it would understate the true line period. Only fields it actually finds are written; anything missing is left at its current value rather than being defaulted. The sidecar takes precedence over calibration embedded in the TIFF, and if its pixel dimensions disagree with the loaded image you get a warning that the two files may not be the same acquisition.

3. **Sensor & F/F₀.** Pick your sensor. **This matters more than it looks.** ASAP5 is a negative-polarity indicator: depolarization *decreases* fluorescence, so F₀ is taken from the *brightest* (diastolic) frames and the output is `1 − F/F₀`. ASAP6 is positive-polarity and uses the opposite convention. Choosing the wrong one inverts ΔF/F₀ and **no APs will be detected at all.** If your recording looks empty, check this before touching any threshold.

   *Baseline % (diastolic lines)* — default 10 — is the fraction of frames used for the per-pixel F₀ median. Raise it for slow rhythms with long diastoles; lower it if the cell fires almost continuously.

4. **ROI Selection.** Drag a rectangle on the Raw tab. Each ROI gets its own averaged trace. With no ROI the full image is used. Drags smaller than ~2 px are discarded silently. Clearing the last ROI asks for confirmation, since it reverts the analysis to the full frame and discards the ROI-scoped results.

5. **Photobleaching.** Leave **Correct** ticked and the method on **Rolling percentile (recommended)**. See §3 for when to change it.

### Step 2 — Detection (one click)

Click **▶ Run Detection** in the Detection Engine panel.

**Nothing detects until you click this**, and **loading a new image resets it** — so re-click after every load. Until then the Z-score, Event Mask, and Overlay tabs stay blank, and so do the events table and all SR panels. The status line under the button tells you which state you are in.

After detection, events are split into **APs** and **subthreshold fluctuations** by an amplitude threshold shown as a red dashed line on the histogram (§3).

### Step 3 — Entrainment and SR analysis (automatic)

This fires by itself ~100 ms after detection completes: Kuramoto R, PSD slope, subthreshold noise, spatial autocorrelation, entropy, conduction velocity, leader stability, conditional firing probability, and shuffled controls. **▶ Run Analysis** in the Entrainment panel is only needed to force a re-run.

### Optional — σ variance partition

The **σ partition** report asks a question that matters before σ is interpreted: how much of the measured subthreshold noise is detected-event variance, and how much is the continuous, sub-detection component?

It requires detection and the entrainment analysis to have run, because it needs AP timings and the per-column event list. The report leads with the variance percentages, and says so explicitly when no diastolic windows were available rather than reporting an empty result.

**Reading it.** A variance fraction near 1 means σ is essentially all detected-event variance, and describing σ as "subthreshold noise" would be misleading. A fraction well below 1 means σ is dominated by sub-detection fluctuation and the slow correlated component, and is properly described as reporting the continuous subthreshold trace rather than SVF activity. State which regime your recordings are in when σ is the independent variable of an SR analysis. `sigma_partition.csv` exports per-column measured and event-driven σ.

### Export

**The one-button route (recommended):** click **⬇ Generate and download all reports** at the top of Export & Tools. It runs detection and entrainment analysis if they haven't run yet, then writes the whole set — `SR_data.csv`, `events.csv`, `phaseTiming.csv`, `roi_traces.csv`, and the validation report if one was run on this recording — all sharing the source filename stem so the files are unambiguously groupable. The status line lists exactly what was written, and names anything skipped along with the reason (for example, `roi_traces.csv` is skipped when no ROI was drawn). Downloads are deliberately spaced a few hundred milliseconds apart: browsers silently drop rapid successive downloads, which would otherwise give you an incomplete set with no error.

The individual buttons all still work exactly as before, and the batch button calls those same functions rather than duplicating their logic — so the two can't drift apart.

The SR exports (`SR Report (PNG)`, `SR Data (CSV)`, `Phase-Timing CSV`, and their JSON equivalents) require Step 3 to have run and will tell you so if it hasn't. `sigma_partition.csv` is written from the σ partition panel rather than by the batch button.

For figures and spreadsheets use the CSV/PNG exports; `SR Data (CSV)` is the most complete single file — all summary metrics, per-column arrays, and entropy. For scripted re-analysis use the **Machine-readable (JSON)** group: `Events (JSON)` carries every detected event with full kinetics, `SR Data (JSON)` carries the complete Step 3 output including all acquisition and detection parameters, and `Phase-Timing (JSON)` carries the raw phase-latency pairs plus the shuffled-control null distribution. The JSON files are the ones to archive if you expect to re-plot or re-test later — they are lossless where the CSVs are flattened.

---

## 3. Parameters worth understanding

Most defaults are validated and should be left alone. Nine sliders carry the tooltip *"Inert under typical single-cell recording conditions"* — on single-cell SAN data they genuinely do nothing, so do not spend time on them. These are the ones that matter.

### Photobleaching

| Method | Use when |
|---|---|
| **Rolling percentile** (default) | Almost always. Tracks the diastolic envelope with a sliding low-percentile window, so it absorbs focus drift and slow motion as well as true bleaching — which exponential fits structurally cannot. |
| Mono-exponential | Clean, monotonic decay and you want a single interpretable τ. |
| Bi-exponential | Fast initial bleach riding on a slow one. Fitted automatically, no parameters. |

**Pacing rate** sets the rolling window. *Auto-detect* estimates cycle length from the autocorrelation of the spatial-mean trace and sets the window to 3 cycles; the `= N lines · detected X Hz` readout tells you what it found. If it reports "pacing not detected", the autocorrelation had no real peak — switch to a fixed rate or Manual.

The 3-cycle default is deliberate. **A window shorter than ~1.5 pacing cycles lets the percentile ride up into the AP upstrokes, at which point the correction starts subtracting real signal.** Only override this in Manual mode, and check the F/F₀ tab afterward.

**Percentile** (default 15 %) sets how far down the amplitude distribution the envelope sits. Raise it if the baseline still drifts; lower it if AP peaks look clipped.

### Detection sensitivity

- **Z-score threshold (σ)**, default 2.0 — the primary control. Raise to cut false positives, lower to catch more events. Change this first.
- **Compound score min**, default 0.15 — secondary filter on the sigmoid quality score. Adjust only after the z-threshold.
- **Cell masking**, on by default at 25 % — rejects extracellular regions. An over-aggressive setting *silently erases real detections*; if events vanish, check the Bkg Mask tab (which shows the **cell** mask, despite the label).

The engine's validated operating range is **AP amplitude ≥ 0.50 ΔF/F₀ and SNR ≥ 8**, where it achieves 100 % sensitivity and 98.4 % precision. Outside that range, verify by eye.

### AP / subthreshold boundary

Three modes in the Amplitude Classification panel:

- **Auto** (default) — locates the valley between the two amplitude populations in a smoothed histogram, after clipping at the 98th percentile to suppress baseline artifacts. If the distribution is not convincingly bimodal it falls back to an Otsu-seeded midpoint; the mode badge tells you which was used.
- **Manual** — drag the red line. You will be asked to confirm, because every Step 3 output is recomputed against the new boundary.
- **Population** — enter one fixed value and lock it. **Use this when comparing recordings.** A per-recording auto threshold makes σ, Kuramoto R, and entropy non-comparable across cells.

### Detrending (Entrainment panel)

Off by default. When enabled, removes slow drift from each column trace *before* the noise metrics are computed, and reports `*_detrended` variants of σ, MAD, PSD β, spatial RMS, and permutation entropy alongside the raw values. Rolling Median (default) or Savitzky–Golay; 500 ms default drift window.

Detrending operates on the **full** column trace including AP frames, then extracts diastolic residuals — filtering the gappy non-AP samples directly would corrupt the time-domain filter. Report raw and detrended values together; a large divergence means drift was contaminating your noise estimate.

---

## 4. Reading the SR outputs

| Metric | Meaning | Units |
|---|---|---|
| **σ_diastole** (per column) | SD of diastolic ΔF/F₀ — the subthreshold noise amplitude. The independent variable of the SR story. | ΔF/F₀ |
| **PSD β** | Slope of log power vs log frequency, fitted over 5–80 % of Nyquist. β ≈ 0 is white noise; β ≈ 2 is Brownian/random-walk structure. Report the R² with it — a poor fit means the slope is not meaningful. | dimensionless |
| **λ** (spatial autocorrelation) | Decay length of noise correlation along the scan line. Computed only from frames with < 15 % AP pixels. | µm |
| **Kuramoto R** | Phase coherence across columns, 0 (incoherent) to 1 (locked). Phase is interpolated linearly between bracketing AP peaks. Reported separately for diastole and AP epochs. | 0–1 |
| **ISI Shannon entropy** | Timing irregularity from the inter-spike-interval distribution (12 bins). Needs ≥ 3 APs in a column. | bits |
| **Permutation entropy** | Ordinal complexity of the diastolic trace (order 3, delay 1), normalized 0–1. ~1.0 means white noise; lower means temporal structure. | 0–1 |
| **Sample entropy** | Regularity of the spatial-mean diastolic trace (m = 2, r = 0.2·SD). Higher = less self-similar. | dimensionless |
| **Conditional firing probability** | P(early next AP \| SVF at a given diastolic phase), against a 100-shuffle null with 95 % CI. This is the direct test of noise-assisted entrainment. | probability |
| **σ variance fraction** | Share of measured σ attributable to detected events. Near 1 = σ is event-driven; well below 1 = σ reports the continuous subthreshold trace. | 0–1 |

**The inverted-U is the point.** The Noise–Regularity panel plots per-column noise against activation jitter and fits the SR curve. Both too little and too much noise degrade regularity; the optimum sits in between. A monotonic relationship instead of a peak usually means your σ range is too narrow to span the optimum, not that SR is absent.

**Interpretation cautions.** ISI entropy is `NaN` for columns with fewer than 3 APs — sparse columns drop out of the mean rather than biasing it, but check `nColsWithAPs` before comparing recordings. β and λ both depend on the AP mask, so they shift when you move the AP threshold; this is expected, and it is why Population mode matters for cross-cell comparisons.

### Rate-controlled measures

Raw σ and β are both biased by firing rate: a faster cell has shorter diastoles, which changes the variance estimate and the accessible frequency band. Detrending removes slow drift but not this rate confound. Two corrected measures address it, and both are reported alongside the uncorrected values so the size of each correction is visible.

| Metric | What it fixes |
|---|---|
| **σ_rate-controlled** | Measures noise in a fixed-length window (default 100 ms, ending 20 ms before the next AP) at the same phase of diastole regardless of rate, with the diastolic depolarization ramp removed by least-squares. On synthetic recordings that differ *only* in rate, this cuts the slow-vs-fast discrepancy from ~96% to <1%. |
| **β_rate-matched** | Fits the power law over a band anchored to the firing rate (default 2×–20× f_beat) instead of a fixed Hz band, with f_beat and its first four harmonics notched out (notch half-width 0.15 × f_beat) so the periodic firing peak doesn't contaminate the slope. |

**A caveat on β specifically.** Rate-matching makes β rate-invariant *only if the diastolic noise is genuinely scale-free over the fitted band*. On a true power-law process the recovery is exact. On our mixed-spectrum synthetics — random walk plus white noise, which is not scale-free — a substantial rate difference survives the correction. Treat the fit **R²** as the diagnostic: a low R² means the power-law assumption doesn't hold over that band and β should not be compared across rates. Report β raw and rate-matched together, with R² for both.

**Regularity and Poincaré.** CV-IEI is exported explicitly because it defines the periodic/irregular classification — the cutoff (default 0.10) and minimum AP count (default 3) are visible, editable settings, and both must be stated in any manuscript using this classification. The Irregularity Score follows Telgkamp et al. (*J Neurophysiol* 2002;88:206–213) and Zanella et al. (*J Neurosci* 2014;34:36–50): `IS_n = |ISI_n − ISI_(n−1)| / ISI_(n−1)`, reported as the per-column mean. Poincaré SD1 (short-term) and SD2 (long-term) quantify how the ISI locus spreads; the SD1/SD2 ratio is `NaN` when SD2 is zero (perfect alternans is mathematically degenerate) and such columns are excluded from the recording mean rather than poisoning it.

**Terminology.** Columns with fewer than the minimum AP count are labelled **silent** in the interface and in the exports. Manuscripts from this laboratory report the same class as **non-firing**, because some such columns still generate subthreshold fluctuations. The two terms mean the same thing; state which you are using.

### Cross-recording analysis

**Fill in Animal ID, Condition, and Region** in the Upload Image panel before exporting. These three fields are load-bearing, not decoration: the mixed-effects model takes random intercepts per **animal**, the inverted-U is fit within **region** (superior vs inferior), and conditions are compared against each other. A summary row missing them cannot be grouped, and you will not be able to reconstruct the grouping later from the filename alone.

The tool pre-fills them by parsing the source filename where your naming convention allows — `SSAN2b-Baseline.tif` resolves to Superior / SAN2B / Baseline, `ISAN1B-Iva.oir` to Inferior / SAN1B / Ivabradine. Two behaviors worth knowing:

- **Condition is matched against a known vocabulary, not by position.** `ASAP5` appears as a hyphen-delimited token in most files and `60x` in many; a positional parser would record those as conditions. Unrecognized tokens are ignored.
- **No condition is guessed when nothing matches.** Files like `ISAN2.oir` with no condition suffix leave the field blank rather than assuming Baseline — in your dataset an absent suffix usually does mean baseline, but inferring it would silently mislabel any recording whose condition simply isn't in the name. Fill it in yourself.

Everything parsed stays editable, and anything you type is never overwritten by a later file load. Both fields accept free text with a suggestion dropdown, so a new condition needs no code change. Entries persist for the browser session.

**Copy summary row (TSV)** in Export & Tools puts one flat row per recording on the clipboard — σ (raw, detrended, rate-controlled), β (raw, detrended, rate-matched), λ, Kuramoto R for diastole and AP, CV-IEI, firing frequency, irregularity score, SD1/SD2, the entropy measures, and the recording/animal/condition/region identifiers you set in the **Rate controls & regularity** panel. The same row is in the JSON and CSV exports as `summaryRow`.

Stack one row per recording and you have the input for the inverted-U fit, a mixed-effects model of R on σ + σ² + rate with random intercepts per recording and animal, and the 2D noise×drive comparison. **The statistical model is deliberately not implemented in the browser** — fit it in R (`lme4`/`nlme`) or Python (`statsmodels`), where the model can be diagnosed properly.

---

## 5. Validating the tool

**Export & Tools → Generate Validation Image** synthesizes a line scan with a known ground truth — by default 10 APs and 15 SVFs per column across 40 columns, at 2.5 Hz with a 4 ms inter-column phase delay, plus sub-detection debris that should be rejected. Amplitudes are drawn from separated distributions (AP 0.22 ± 0.02, SVF 0.07 ± 0.01 ΔF/F₀) with a planted boundary at 0.14. The seed is fixed at 42, so runs are reproducible.

The image flows through the identical detection and classification path as a real recording. **Download Validation Report** produces a self-contained HTML file with per-class precision/recall/F1, matched/missed/false-positive counts, and recovery error for the AP/SVF boundary, firing frequency, and Kuramoto R.

Pass criteria: AP recall ≥ 90 %, SVF recall ≥ 70 %, boundary ≤ 20 % error, frequency ≤ 10 % error, Kuramoto R within 0.10 absolute. Archive the report alongside your analysis.

**Unit tests.** Four Node.js test files ship with the repository and cover the numerical routines hardest to check by eye. From the directory holding the analyzer HTML file, run `node run_tests.js` for all of them, or run each individually (`test_filename_parser.js`, `test_metadata_parser.js`, `test_regularity_poincare.js`, `test_rate_control_e2e.js`). They need Node.js v18 or later and no dependencies. On the released version all four pass, 69 assertions in total. The tests read the shipped HTML file and lift functions out of it by name, so they exercise the released code rather than a copy.

---

## 6. Troubleshooting

| Symptom | Cause |
|---|---|
| No events at all | Wrong sensor selected (inverts ΔF/F₀), or **▶ Run Detection** not clicked since loading. |
| Everything blank after loading a new image | Detection state resets on load. Click **▶ Run Detection** again. |
| Overlay / Z-score / Event Mask tabs empty | Same — detection has not run. |
| Events disappear as you raise cell-mask % | Mask is erasing real signal. Check the Bkg Mask tab. |
| "Run entrainment analysis first" on export | Step 3 hasn't completed. Click **▶ Run Analysis**. |
| σ partition refuses to run | It needs AP timings. Run detection, then the entrainment analysis, then the partition. |
| σ partition reports no diastolic windows | The diastoles are shorter than the rate-control window, or too few APs were detected to define one. Check the detected rate and the window length. |
| Temporal Profile peaks sit below the red line | Expected. The line is the per-column threshold; the plotted trace is spatially averaged, so its peaks are lower. Not missed APs. |
| Rates, widths, or velocities look implausible | ms/line or µm/pixel are wrong. Load the metadata TXT rather than typing them. |
| Metadata TXT loads but changes nothing | Not an Olympus FV export, or the `[General]` section is missing. The status line says so and no values are applied. |
| Warning that image and metadata dimensions disagree | The TXT describes a different acquisition than the loaded image. Check you paired the right two files. |
| Auto threshold looks misplaced | Distribution wasn't bimodal and it fell back to Otsu-midpoint. Switch to Manual or Population. |
| Sliders appear to do nothing | Those marked "inert under typical single-cell conditions" genuinely don't affect single-cell data. |
| Progress overlay stays up a long time | Large ROI on a long recording. The cost guard warns before runs it predicts will be slow; let it finish rather than reloading. |
| Tests fail with "could not find the analyzer HTML file" | Run them from the folder containing the analyzer, or set `GEVI_ANALYZER` to its full path. |

---

## 7. Citation and reporting

When reporting results, state: tool version (**v1.8.1**), sensor, ms/line and µm/pixel, photobleach method and its parameters, z-score threshold, AP-threshold mode (auto / manual / population, and the value), and whether detrending was enabled with which method and window.

Every one of these is written into the `parameters` block of `SR Data (JSON)` and into the summary section of `SR Data (CSV)`. Archiving one of those two files with your figures is the fastest reliable way to make an analysis reproducible — it captures the full parameter state without your having to transcribe it.

Citation details, including the machine-readable `CITATION.cff`, are in the [README](README.md#citing-this-software).
