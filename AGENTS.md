# OrbitalQuery — Project Instructions

## Project Identity

OrbitalQuery is a semantic Earth Observation data discovery and analysis platform.

It enables researchers, geospatial professionals, planners and other decision-makers to query Earth Observation datasets using:

- Natural language
- Geographic constraints
- Time ranges

It combines semantic search, Earth Observation dataset discovery, GIS visualization, raster analysis and temporal analysis.

## Product Positioning

OrbitalQuery is a research, exploration and decision-support tool.

It is NOT intended for:

- Operational disaster response
- Mission-critical decision making
- Replacing professional geospatial analysis
- Claiming ground truth from satellite imagery alone

Do not position the product as a disaster-response or mission-critical system.

---

# CRITICAL: GENERAL-PURPOSE ARCHITECTURE

Hyderabad is ONLY a demonstration example.

The example query:

"Urban expansion in Hyderabad between 2021 and 2025"

must NEVER become hardcoded product logic.

Do NOT hardcode:

- Hyderabad
- Telangana
- India
- Urban expansion
- 2021–2025
- Sentinel-2
- Specific spectral indices
- Specific geographic regions

The application must remain query-driven.

The user's query determines:

1. Location
2. Phenomenon
3. Time range
4. Geographic constraints
5. Relevant datasets
6. Applicable analysis
7. Available metrics
8. Appropriate visualization

Changing the location, time range or phenomenon must not require rewriting frontend logic.

Hyderabad is the HERO DEMO CASE, not the PRODUCT DEFINITION.

---

# Core UX Philosophy

The target workflow is:

QUESTION
→ UNDERSTAND
→ DISCOVER
→ ANALYZE
→ INSIGHT
→ EVIDENCE
→ DETAIL

The application should feel like an intelligent Earth Observation research assistant rather than a satellite-data browser.

Prioritize:

1. What did OrbitalQuery find?
2. Where?
3. When?
4. How much change?
5. Show the evidence.
6. Which data was used?
7. How was it calculated?

Avoid data-dump interfaces.

---

# Scientific Integrity

NEVER fabricate:

- Accuracy
- Confidence
- Change percentages
- Changed area
- Dataset counts
- Processing times
- Coverage
- Progress percentages
- Analysis results

If a value is not actually calculated, do not invent it.

Use "Not available" or omit it.

Do not imply that every visual difference represents real-world change.

---

# Satellite Visualization Rules

Before/After comparisons must use corresponding satellite observations over the same geographic region.

Swipe mode must compare:

EARLIER SATELLITE IMAGE
vs
LATER SATELLITE IMAGE

It must NOT compare:

Google Maps
vs
Satellite imagery

Google Maps may be used as a basemap but is not itself an Earth Observation observation.

Ensure:

- Consistent geographic bounds
- Correct CRS
- Correct reprojection
- Correct raster dimensions
- Correct resolution handling
- Correct nodata handling
- Synchronized zoom/pan

---

# Discover Mode

Discover is a separate workflow.

Its purpose is:

"What Earth Observation data is available in this region?"

Discover should focus on:

REGION
+
TIME
+
DATA AVAILABILITY

Do not make Discover pretend to perform analysis unless the requested analysis is actually supported.

---

# Engineering Principles

Before modifying code:

1. Inspect the existing implementation.
2. Understand the architecture.
3. Identify relevant files.
4. Identify existing APIs.
5. Identify existing data structures.
6. Reuse existing functionality.
7. Make the smallest safe change.

Do NOT:

- Rewrite the application unnecessarily.
- Replace frameworks without justification.
- Replace existing libraries without justification.
- Create duplicate logic.
- Modify unrelated components.
- Add unnecessary dependencies.
- Remove working functionality.

Prefer incremental changes.

---

# Development Workflow

Use this sequence:

DIAGNOSE
→ PLAN
→ IMPLEMENT
→ TEST
→ REVIEW

Do not jump directly into implementation for large changes.

For substantial changes, first explain:

- Current behavior
- Root cause
- Proposed solution
- Files affected
- Risks
- Verification plan

Then implement.

---

# SIH Priority

The current priority is preparing a reliable MVP for SIH evaluation.

Prioritize:

P0:
- Temporal satellite alignment
- Before/After reliability
- Swipe reliability
- Difference visualization
- Insight-first results
- Reliable processing states
- Removal of misleading metrics
- Stable demo workflow

P1:
- Discover improvements
- Better query explanation
- Better visual hierarchy
- Change-region interaction
- Report/export improvements

P2:
- Large-scale provider expansion
- Advanced ML
- Complex multi-agent systems
- Production-scale infrastructure
- Experimental features

Never sacrifice P0 stability for P1/P2 features.

---

# Testing Requirements

When changing core functionality, test more than the Hyderabad example.

At minimum consider:

1. Urban expansion in Hyderabad between 2021 and 2025
2. A different geographic location
3. A different time range
4. A different phenomenon
5. Dataset-discovery query
6. Unsupported analysis query

Verify that the architecture remains generic.

---

# Communication Requirements

When reporting work:

1. Explain what changed.
2. Explain why.
3. List files modified.
4. List tests performed.
5. Report limitations.
6. Report anything that remains uncertain.

Do not claim something works unless it was actually verified.

Do not hide failed tests.
