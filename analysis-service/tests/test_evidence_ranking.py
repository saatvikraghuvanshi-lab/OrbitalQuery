"""Tests for the evidence ranking engine with known-best-scene scenarios."""

import pytest

from app.services.evidence_ranking import (
    score_cloud,
    score_coverage,
    score_temporal,
    score_seasonal,
    score_sensor,
    score_resolution,
    score_band_availability,
    check_rejections,
    rank_scene,
    rank_scenes,
    DEFAULT_WEIGHTS,
)


# ── Synthetic scene generators ────────────────────────────────────


def make_perfect_scene() -> dict:
    """A perfect scene: low clouds, complete coverage, right date, good sensor."""
    return {
        "id": "S2A_PERFECT_20240315",
        "bbox": [75.5, 26.5, 76.0, 27.0],
        "collection": "sentinel-2-l2a",
        "properties": {
            "datetime": "2024-03-15T10:30:00Z",
            "eo:cloud_cover": 2.0,
            "gsd": 10.0,
            "processing:level": "S2MSI2A",
            "platform": "Sentinel-2A",
        },
        "assets": {"B02": {}, "B03": {}, "B04": {}, "B08": {}, "B11": {}, "B12": {}},
    }


def make_cloudy_scene() -> dict:
    """A scene with high cloud cover — should rank lower."""
    scene = make_perfect_scene()
    scene["id"] = "S2A_CLOUDY_20240315"
    scene["properties"]["eo:cloud_cover"] = 85.0
    return scene


def make_out_of_area_scene() -> dict:
    """A scene that doesn't overlap with the AOI at all."""
    scene = make_perfect_scene()
    scene["id"] = "S2A_OUTOFAREA_20240315"
    scene["bbox"] = [10.0, 50.0, 11.0, 51.0]  # Completely different location
    return scene


def make_wrong_season_scene() -> dict:
    """A scene from the wrong season (August instead of March)."""
    scene = make_perfect_scene()
    scene["id"] = "S2A_WRONG_SEASON_20240815"
    scene["properties"]["datetime"] = "2024-08-15T10:30:00Z"
    return scene


def make_landsat_scene() -> dict:
    """A Landsat scene — decent but lower resolution."""
    scene = make_perfect_scene()
    scene["id"] = "LC08_20240315"
    scene["collection"] = "landsat-c2-l2"
    scene["properties"]["gsd"] = 30.0
    scene["assets"] = {"B2": {}, "B3": {}, "B4": {}, "B5": {}}
    return scene


def make_missing_bands_scene() -> dict:
    """A scene missing some required bands."""
    scene = make_perfect_scene()
    scene["id"] = "S2A_MISSING_BANDS"
    scene["assets"] = {"B02": {}, "B04": {}}  # Missing B03, B08
    return scene


AOI_BBOX = [75.7, 26.8, 75.9, 27.0]  # Jaipur area


# ── Cloud scoring tests ──────────────────────────────────────────


class TestCloudScoring:
    def test_clear_sky(self):
        score, reason = score_cloud(1.0)
        assert score >= 95
        assert "excellent" in reason.lower() or "1.0%" in reason

    def test_moderate_clouds(self):
        score, reason = score_cloud(30.0)
        assert 40 <= score <= 80

    def test_heavy_clouds(self):
        score, reason = score_cloud(90.0)
        assert score < 30

    def test_unknown_cloud(self):
        score, reason = score_cloud(None)
        assert score == 70.0

    def test_zero_clouds(self):
        score, _ = score_cloud(0.0)
        assert score == 100.0


# ── Coverage scoring tests ───────────────────────────────────────


class TestCoverageScoring:
    def test_complete_coverage(self):
        score, reason = score_coverage([75.5, 26.5, 76.0, 27.0], AOI_BBOX)
        assert score == 100.0
        assert "Complete" in reason or "100.0%" in reason

    def test_no_overlap(self):
        score, reason = score_coverage([10.0, 50.0, 11.0, 51.0], AOI_BBOX)
        assert score == 0.0
        assert "No spatial overlap" in reason

    def test_partial_coverage(self):
        # Scene covers half the AOI (50% coverage → score ~40)
        score, reason = score_coverage([75.7, 26.8, 75.8, 27.0], AOI_BBOX)
        assert 35 <= score < 100


# ── Temporal scoring tests ───────────────────────────────────────


class TestTemporalScoring:
    def test_exact_center(self):
        score, reason = score_temporal("2024-03-16T10:00:00Z", "2024-03-01", "2024-03-31")
        assert score == 100.0
        assert "exact center" in reason.lower()

    def test_near_center(self):
        score, _ = score_temporal("2024-03-20T10:00:00Z", "2024-03-01", "2024-03-31")
        assert score > 70

    def test_edge_of_range(self):
        score, _ = score_temporal("2024-03-01T10:00:00Z", "2024-03-01", "2024-03-31")
        assert score >= 50


# ── Seasonal scoring tests ──────────────────────────────────────


class TestSeasonalScoring:
    def test_same_month(self):
        score, reason = score_seasonal("2024-03-15T10:00:00Z", 3)
        assert score == 100.0
        assert "Same month" in reason

    def test_adjacent_month(self):
        score, _ = score_seasonal("2024-04-15T10:00:00Z", 3)
        assert score >= 85

    def test_opposite_season(self):
        score, _ = score_seasonal("2024-09-15T10:00:00Z", 3)
        assert score < 50


# ── Band availability tests ─────────────────────────────────────


class TestBandAvailability:
    def test_all_bands_present(self):
        assets = {"B02": {}, "B03": {}, "B04": {}, "B08": {}}
        score, reason = score_band_availability(assets, ["B02", "B03", "B04", "B08"])
        assert score == 100.0
        assert "All" in reason

    def test_missing_bands(self):
        assets = {"B02": {}, "B04": {}}
        score, reason = score_band_availability(assets, ["B02", "B03", "B04", "B08"])
        assert score == 50.0
        assert "missing" in reason.lower()

    def test_no_requirements(self):
        assets = {"B02": {}}
        score, _ = score_band_availability(assets, None)
        assert score == 90.0


# ── Rejection tests ─────────────────────────────────────────────


class TestRejections:
    def test_cloud_rejection(self):
        scene = make_cloudy_scene()
        rejections = check_rejections(scene, AOI_BBOX, max_cloud_cover=30)
        assert len(rejections) > 0
        assert "Cloud cover" in rejections[0]

    def test_no_rejection_for_clear(self):
        scene = make_perfect_scene()
        rejections = check_rejections(scene, AOI_BBOX, max_cloud_cover=30)
        assert len(rejections) == 0

    def test_spatial_rejection(self):
        scene = make_out_of_area_scene()
        rejections = check_rejections(scene, AOI_BBOX)
        assert len(rejections) > 0
        assert "No spatial overlap" in rejections[0]


# ── Full ranking tests with known-best scenarios ─────────────────


class TestSceneRanking:
    def test_perfect_beats_cloudy(self):
        """The perfect scene must rank above the cloudy scene."""
        perfect = make_perfect_scene()
        cloudy = make_cloudy_scene()

        r_perfect = rank_scene(perfect, AOI_BBOX, target_start="2024-03-01", target_end="2024-03-31")
        r_cloudy = rank_scene(cloudy, AOI_BBOX, target_start="2024-03-01", target_end="2024-03-31")

        assert r_perfect.overall_score > r_cloudy.overall_score
        assert r_perfect.suitable is True
        assert r_cloudy.suitable is True  # Still suitable, just lower score

    def test_out_of_area_rejected(self):
        """Scene outside AOI must be rejected."""
        scene = make_out_of_area_scene()
        ranking = rank_scene(scene, AOI_BBOX)
        assert ranking.suitable is False
        assert len(ranking.rejection_reasons) > 0

    def test_cloudy_rejected_above_threshold(self):
        """Scene above cloud threshold must be rejected."""
        scene = make_cloudy_scene()
        ranking = rank_scene(scene, AOI_BBOX, max_cloud_cover=30)
        assert ranking.suitable is False

    def test_wrong_season_lower_score(self):
        """Wrong-season scene must score lower than same-season."""
        perfect = make_perfect_scene()
        wrong_season = make_wrong_season_scene()

        r_perfect = rank_scene(perfect, AOI_BBOX, target_start="2024-03-01", target_end="2024-03-31")
        r_wrong = rank_scene(wrong_season, AOI_BBOX, target_start="2024-03-01", target_end="2024-03-31")

        assert r_perfect.overall_score > r_wrong.overall_score

    def test_landsat_beats_cloudy_s2(self):
        """A clear Landsat should beat a cloudy Sentinel-2."""
        landsat = make_landsat_scene()
        cloudy_s2 = make_cloudy_scene()

        r_landsat = rank_scene(landsat, AOI_BBOX, target_start="2024-03-01", target_end="2024-03-31")
        r_cloudy = rank_scene(cloudy_s2, AOI_BBOX, target_start="2024-03-01", target_end="2024-03-31")

        assert r_landsat.overall_score > r_cloudy.overall_score

    def test_scores_are_bounded(self):
        """All scores must be between 0 and 100."""
        scene = make_perfect_scene()
        ranking = rank_scene(scene, AOI_BBOX)
        assert 0 <= ranking.overall_score <= 100
        for c in ranking.components:
            assert 0 <= c.score <= 100


class TestMultiSceneRanking:
    def test_best_scene_is_perfect(self):
        """When ranking multiple scenes, the perfect one must be best."""
        scenes = [
            make_cloudy_scene(),
            make_out_of_area_scene(),
            make_wrong_season_scene(),
            make_perfect_scene(),
            make_landsat_scene(),
        ]

        result = rank_scenes(scenes, AOI_BBOX, target_start="2024-03-01", target_end="2024-03-31")

        assert result.status == "ok"
        assert result.total_scenes == 5
        assert result.best_scene is not None
        assert result.best_scene.item_id == "S2A_PERFECT_20240315"
        assert result.best_scene.overall_score > 80

    def test_rejected_scene_counted(self):
        """Rejected scenes must be counted correctly."""
        scenes = [make_out_of_area_scene(), make_perfect_scene()]
        result = rank_scenes(scenes, AOI_BBOX)
        assert result.rejected_count >= 1
        assert result.suitable_count >= 1

    def test_top_n_limits_results(self):
        """top_n must limit the number of returned rankings."""
        scenes = [make_perfect_scene(), make_cloudy_scene(), make_landsat_scene()]
        result = rank_scenes(scenes, AOI_BBOX, top_n=2)
        assert len(result.rankings) == 2

    def test_empty_scenes(self):
        """Empty scene list should return no_scenes status."""
        result = rank_scenes([], AOI_BBOX)
        assert result.status == "no_scenes"
        assert result.total_scenes == 0

    def test_sorted_descending(self):
        """Results must be sorted by score descending."""
        scenes = [make_cloudy_scene(), make_perfect_scene(), make_landsat_scene()]
        result = rank_scenes(scenes, AOI_BBOX)
        scores = [r.overall_score for r in result.rankings]
        assert scores == sorted(scores, reverse=True)

    def test_processing_steps_documented(self):
        """Every ranking must have processing steps."""
        scenes = [make_perfect_scene()]
        result = rank_scenes(scenes, AOI_BBOX)
        assert len(result.processing_steps) >= 2
        step_names = [s["step"] for s in result.processing_steps]
        assert "init" in step_names
        assert "rank" in step_names
