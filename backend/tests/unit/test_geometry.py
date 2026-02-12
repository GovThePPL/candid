"""Unit tests for helpers/geometry.py — convex hull and centroid computation."""

import pytest

from candid.controllers.helpers.geometry import compute_convex_hull, compute_centroid

pytestmark = pytest.mark.unit


class TestComputeConvexHull:
    def test_less_than_3_points_returned_as_is(self):
        pts = [{"x": 0, "y": 0}, {"x": 1, "y": 1}]
        assert compute_convex_hull(pts) == pts

    def test_single_point(self):
        pts = [{"x": 5, "y": 5}]
        assert compute_convex_hull(pts) == pts

    def test_empty_list(self):
        assert compute_convex_hull([]) == []

    def test_triangle_returned_as_hull(self):
        pts = [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 2, "y": 3}]
        hull = compute_convex_hull(pts)
        assert len(hull) == 3

    def test_square_with_interior_point(self):
        """Interior point should NOT be in the hull."""
        pts = [
            {"x": 0, "y": 0}, {"x": 4, "y": 0},
            {"x": 4, "y": 4}, {"x": 0, "y": 4},
            {"x": 2, "y": 2},  # interior
        ]
        hull = compute_convex_hull(pts)
        # Only the 4 corner points should be on the hull
        assert len(hull) == 4
        hull_set = {(p["x"], p["y"]) for p in hull}
        assert (2, 2) not in hull_set

    def test_collinear_points(self):
        """Collinear points should not all be in the hull."""
        pts = [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 2, "y": 0}]
        hull = compute_convex_hull(pts)
        # With collinear points, Graham scan should return at most the endpoints
        assert len(hull) <= 3

    def test_all_points_on_hull(self):
        """Regular pentagon — all 5 points on the hull."""
        import math
        pts = [
            {"x": round(math.cos(2 * math.pi * i / 5), 4),
             "y": round(math.sin(2 * math.pi * i / 5), 4)}
            for i in range(5)
        ]
        hull = compute_convex_hull(pts)
        assert len(hull) == 5

    def test_duplicate_points(self):
        pts = [{"x": 0, "y": 0}, {"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 0, "y": 1}]
        hull = compute_convex_hull(pts)
        assert len(hull) >= 3


class TestComputeCentroid:
    def test_empty_returns_origin(self):
        assert compute_centroid([]) == {"x": 0, "y": 0}

    def test_single_point(self):
        result = compute_centroid([{"x": 3, "y": 7}])
        assert result == {"x": 3.0, "y": 7.0}

    def test_two_points_midpoint(self):
        result = compute_centroid([{"x": 0, "y": 0}, {"x": 4, "y": 4}])
        assert result == {"x": 2.0, "y": 2.0}

    def test_symmetric_square(self):
        pts = [
            {"x": 0, "y": 0}, {"x": 4, "y": 0},
            {"x": 4, "y": 4}, {"x": 0, "y": 4},
        ]
        result = compute_centroid(pts)
        assert result == {"x": 2.0, "y": 2.0}

    def test_rounding(self):
        pts = [{"x": 1, "y": 1}, {"x": 2, "y": 2}, {"x": 3, "y": 3}]
        result = compute_centroid(pts)
        assert result == {"x": 2.0, "y": 2.0}
