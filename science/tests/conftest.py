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
