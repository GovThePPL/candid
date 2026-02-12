"""Geometry helpers for opinion map visualization.

Pure math functions for convex hull computation and centroids.
"""

import math
from typing import Dict, List


def compute_convex_hull(points: List[Dict[str, float]]) -> List[Dict[str, float]]:
    """Compute the convex hull of a set of 2D points using Graham scan.

    Returns points in counter-clockwise order.
    """
    if len(points) < 3:
        return points

    # Find the point with lowest y (and leftmost if tied)
    def bottom_left(p):
        return (p["y"], p["x"])

    points = sorted(points, key=bottom_left)
    start = points[0]

    # Sort remaining points by polar angle from start point
    def polar_angle(p):
        dx = p["x"] - start["x"]
        dy = p["y"] - start["y"]
        return math.atan2(dy, dx)

    rest = sorted(points[1:], key=polar_angle)

    # Build hull using Graham scan
    hull = [start]

    for p in rest:
        while len(hull) > 1:
            # Check if we make a left turn
            o = hull[-2]
            a = hull[-1]
            cross = (a["x"] - o["x"]) * (p["y"] - o["y"]) - (a["y"] - o["y"]) * (p["x"] - o["x"])
            if cross <= 0:
                hull.pop()
            else:
                break
        hull.append(p)

    return hull


def compute_centroid(points: List[Dict[str, float]]) -> Dict[str, float]:
    """Compute the centroid (center of mass) of a set of points."""
    if not points:
        return {"x": 0, "y": 0}

    x_sum = sum(p["x"] for p in points)
    y_sum = sum(p["y"] for p in points)
    n = len(points)

    return {
        "x": round(x_sum / n, 4),
        "y": round(y_sum / n, 4)
    }
