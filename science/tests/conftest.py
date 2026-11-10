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


def pytest_collection_modifyitems(config, items):
    """
    Ensure CI explicitly and cleanly marks DEM-dependent tests as SKIPPED
    with a clear explanation when 1.5 GB DEM assets are not present on runner.
    """
    import pathlib
    here = pathlib.Path(__file__).resolve().parent
    repo_root = here.parent.parent
    dem_polar = repo_root / "terrain" / "LDEM_75S_30M.JP2"
    dem_global = repo_root / "terrain" / "global" / "LDEM_64.JP2"
    has_dems = dem_polar.exists() or dem_global.exists()

    if not has_dems:
        skip_dems = pytest.mark.skip(
            reason="DEM assets not found in terrain/. Run `python pipeline/download_dems.py --download` to fetch."
        )
        for item in items:
            if "needs_dems" in item.keywords or "terrain" in item.nodeid:
                if "synthetic" not in item.name:
                    item.add_marker(skip_dems)


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
