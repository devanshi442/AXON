
import json
from pathlib import Path

# Resolve the repository root relative to this script:
# pipeline/inspect_fixtures.py -> repository root
ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "science" / "fixtures" / "horizons"

KEYWORDS = (
    "Target body",
    "Center body",
    "Center geodetic",
    "Center-site",
    "Step-size",
    "Date__(UT)",
)


def inspect_fixture(path: Path) -> None:
    print("=" * 70)
    print(path.name)

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR reading JSON: {exc}")
        return

    result = data.get("result", "")
    if not isinstance(result, str) or "$$SOE" not in result:
        print("NO DATA TABLE. First 800 characters:")
        print(str(result)[:800])
        return

    head, remainder = result.split("$$SOE", 1)

    if "$$EOE" not in remainder:
        print("ERROR: Missing $$EOE closing marker.")
        print("Data after $$SOE, first 800 characters:")
        print(remainder[:800])
        return

    table, _ = remainder.split("$$EOE", 1)
    rows = [line.strip() for line in table.splitlines() if line.strip()]

    print("rows:", len(rows))

    for line in head.splitlines():
        if any(keyword in line for keyword in KEYWORDS):
            print("  ", line.strip())

    for line in rows[:3]:
        print("  ", line)

    if not rows:
        print("WARNING: Data table is empty.")


def main() -> None:
    if not FIXTURES.is_dir():
        print(f"Fixture directory not found: {FIXTURES}")
        return

    paths = sorted(FIXTURES.glob("*.json"))
    if not paths:
        print(f"No JSON fixtures found in: {FIXTURES}")
        return

    for path in paths:
        inspect_fixture(path)


if __name__ == "__main__":
    main()
