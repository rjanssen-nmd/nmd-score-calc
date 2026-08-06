import math

import pytest

from nmd_score_calc.bridge import (
    build_mpg_kern,
    calc_scale_factor,
    calculate_mpg,
    reconcile_scaling,
)


def test_build_mpg_kern_matches_upstream_behavior():
    stages = ["A1-3", "B1", "B4", "B5", "C3", "D"]

    kern = build_mpg_kern(0.75, 0.5, True, stages)

    assert kern[0][0] == 0.2
    assert kern[1][1] == 0.75
    assert kern[2][2] == 1.25
    assert kern[3][3] == 0.0
    assert kern[4][4] == 0.2
    assert kern[5][5] == 0.2

    assert kern[1][2] == 0.5
    assert kern[0][2] == 0.5
    assert kern[4][2] == 0.5
    assert kern[5][2] == 0.0


@pytest.mark.parametrize(
    ("formula", "params", "x_ref", "x", "expected_ref", "expected"),
    [
        ("v3_linear", [2, 1], 10, 20, 21, 41),
        ("v4_linear", [2, 1], 10, 20, 21, 41),
        ("v4_nonlinear", [1, 2, 3, 4], 2, 3, 26, 58),
        ("v3_power", [2, 3, 4], 2, 3, 20, 58),
        ("v3_logarithmic", [2, 3, 4], 2, 3, None, None),
    ],
)
def test_calc_scale_factor_formula_branches(formula, params, x_ref, x, expected_ref, expected):
    profile = {
        "title": "Profile",
        "scaling": {
            "dimensions": [
                {"inspected_value": x_ref, "minimum": 0, "maximum": 100},
            ],
            "parameters": params,
            "formula": formula,
        },
    }
    schaling_profiles = [
        {"profiel": "Profile", "dimensies": [x]},
    ]

    factor = calc_scale_factor(profile, schaling_profiles)

    if formula == "v3_logarithmic":
        expected_value = (2 * math.log(3) + 4) / (2 * math.log(2) + 4)
    else:
        expected_value = expected / expected_ref

    assert factor == pytest.approx(expected_value)


def test_reconcile_scaling_auto_matches_by_dimension_count_and_fills_inspected_values():
    declaration = {
        "environmental_profiles": [
            {
                "title": "Profile 1",
                "scaling": {
                    "dimensions": [
                        {"inspected_value": 10},
                        {"inspected_value": 20},
                    ],
                },
            },
            {
                "title": "Profile 2",
                "scaling": {
                    "dimensions": [
                        {"inspected_value": 30},
                    ],
                },
            },
        ]
    }

    result = reconcile_scaling(
        [{"profiel": "Generic", "dimensies": [5, 6]}],
        declaration,
        "NMD-1",
    )

    assert len(result["schaling"]) == 1
    assert result["schaling"][0]["profiel"] == "Profile 1"
    assert result["schaling"][0]["dimensies"] == [5, 6]
    assert result["schaling"][0]["inspectedValues"] == [10, 20]


def test_calculate_mpg_uses_js_orchestration_for_a_single_product():
    assessment_strategy = {
        "id": "strategy-1",
        "title": "Strategy",
        "impact_indicators": [
            {"impact_indicator": "impact-1", "weight": 1.0, "ordering": 1},
        ],
    }
    impact_indicators = [{"id": "impact-1", "title": "Impact 1"}]

    declaration = {
        "construction_product": {"title": "Test product", "lifespan": 75},
        "environmental_profiles": [
            {
                "title": "Profile A",
                "environmental_data": [
                    {
                        "assessment_strategy": "strategy-1",
                        "scores": [[1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]],
                    }
                ],
            }
        ],
    }

    project = {"levensduur": 75, "bvo": 75, "peildatumHandhaven": True}
    producten = [
        {
            "nmd_id": "NMD-1",
            "aantal": 1,
            "onv_herg": True,
            "schaling": [],
            "_declaration": declaration,
            "_registration": {"category": "category-1"},
            "_declarationValid": True,
        }
    ]

    result = calculate_mpg(project, producten, assessment_strategy, impact_indicators)

    assert result["includedProducts"] == 1
    assert result["totalProducts"] == 1
    assert result["mki"] == pytest.approx(0.2)
    assert result["mpg"] == pytest.approx(0.2 / 5625)
    assert result["impactLabels"] == ["Impact 1"]
    assert result["productRows"][0]["nmd_id"] == "NMD-1"
