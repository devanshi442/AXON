"""
conftest.py — shared pytest fixtures and markers for lunarsight_core tests.
"""
import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "needs_kernels: test requires SPICE kernel files in kernels/ directory "
        "(skip with: pytest -m 'not needs_kernels')"
    )
    config.addinivalue_line(
        "markers",
        "needs_network: test requires network access to Horizons / NAIF "
        "(skip with: pytest -m 'not needs_network')"
    )
    config.addinivalue_line(
        "markers",
        "needs_dems: test requires LOLA DEM files in terrain/ directory "
        "(skip with: pytest -m 'not needs_dems')"
    )
    config.addinivalue_line(
        "markers",
        "needs_polar_dem: test requires Polar Stereographic LOLA DEM in terrain/ "
        "(skip with: pytest -m 'not needs_polar_dem')"
    )
    config.addinivalue_line(
        "markers",
        "needs_global_dem: test requires Global Equirectangular LOLA DEM in terrain/global/ "
        "(skip with: pytest -m 'not needs_global_dem')"
    )


def pytest_collection_modifyitems(config, items):
    """
    Ensure CI explicitly and cleanly marks DEM-dependent tests as SKIPPED
    with a clear explanation when required DEM assets are not present on runner.
    Checks test-specific DEM requirements (polar vs global) individually.
    """
    import pathlib
    here = pathlib.Path(__file__).resolve().parent
    repo_root = here.parent.parent
    dem_polar = repo_root / "terrain" / "LDEM_75S_30M.JP2"
    dem_global = repo_root / "terrain" / "global" / "LDEM_64.JP2"

    has_polar = dem_polar.is_file()
    has_global = dem_global.is_file()

    skip_polar = pytest.mark.skip(
        reason="Polar DEM (LDEM_75S_30M.JP2) not found in terrain/. Run `python pipeline/download_dems.py --download` to fetch."
    )
    skip_global = pytest.mark.skip(
        reason="Global DEM (terrain/global/LDEM_64.JP2) not found. Run `python pipeline/download_dems.py --download` to fetch."
    )
    skip_both = pytest.mark.skip(
        reason="Required polar and/or global DEM assets not found in terrain/."
    )

    for item in items:
        # Check specific markers
        if item.get_closest_marker("needs_polar_dem") and not has_polar:
            item.add_marker(skip_polar)
        elif item.get_closest_marker("needs_global_dem") and not has_global:
            item.add_marker(skip_global)
        elif item.get_closest_marker("needs_dems") or "needs_dems" in item.keywords:
            if not has_polar or not has_global:
                item.add_marker(skip_both)
        # Backwards compatibility name checks
        elif item.name in ("test_cross_check_real_polar_sites", "test_observer_mast_height_monotone"):
            if not has_polar:
                item.add_marker(skip_polar)
        elif item.name == "test_dem_selection_coverage_rules":
            if not has_polar or not has_global:
                item.add_marker(skip_both)


@pytest.fixture
def kernels_dir(tmp_path_factory, request):
    """Return the path to the kernels/ directory at the repo root.
    Skip the test if kernels are not present (avoids CI failures when
    the large binary files have not been downloaded).
    """
    import pathlib
    # Walk up from conftest location to find the repo root
    here = pathlib.Path(__file__).resolve().parent
    repo_root = here.parent.parent  # science/tests/ → science/ → repo root
    kernels = repo_root / "kernels"
    lsk = kernels / "naif0012.tls"
    if not lsk.exists():
        pytest.skip(
            "SPICE kernels not found. Run `python pipeline/fetch_kernels.py` first. "
            "To skip all kernel tests: pytest -m 'not needs_kernels'"
        )
    return kernels
