"""
sites.py — Single source of truth site registry for AXON LunarSight.

Normalizes missions (site.lat/lon), reference_sites, and candidate_sites (lat_center/lon_center)
into a unified schema:
  {id, name, kind, lat, lon, coord_status, coord_kind, uncertainty_km, verified, source_urls, terrain_tier}
Skips null coordinates with explicit reporting. Validates planetary bounds.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml

from lunarsight_core import constants as C


@dataclass
class SiteRecord:
    id: str
    name: str
    kind: str  # "mission" | "reference" | "candidate" | "custom"
    lat: Optional[float]
    lon: Optional[float]
    coord_status: str  # "ok" | "null_coordinates" | "out_of_bounds"
    coord_kind: str  # "actual" | "planned" | "planned_region_center" | "candidate_region_center" | "reference" | "custom" | "unknown"
    uncertainty_km: Optional[float]
    verified: bool
    source_urls: List[str] = field(default_factory=list)
    terrain_tier: str = "T3"  # "T1" | "T2" | "T3"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_valid(self) -> bool:
        return self.coord_status == "ok" and self.lat is not None and self.lon is not None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _validate_coords(lat: Optional[float], lon: Optional[float]) -> tuple[Optional[float], Optional[float], str]:
    if lat is None or lon is None:
        return None, None, "null_coordinates"
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (ValueError, TypeError):
        return None, None, "null_coordinates"

    if not (C.LAT_MIN_DEG <= lat_f <= C.LAT_MAX_DEG) or not (C.LON_MIN_DEG <= lon_f <= C.LON_MAX_DEG):
        return lat_f, lon_f, "out_of_bounds"

    return lat_f, lon_f, "ok"


def _infer_terrain_tier(lat: Optional[float]) -> str:
    """Infer available terrain tier based on latitude."""
    if lat is None:
        return "T3"
    # Polar DEMs cover 75°S to 90°S (Tier 1: 20-40 m/px)
    if lat <= -75.0:
        return "T1"
    # Non-polar with global 64 ppd DEM (~474 m/px)
    return "T2"


def load_site_registry(data_yaml_or_json: Optional[Path | str] = None) -> List[SiteRecord]:
    """
    Load and normalize all sites from data/missions.yaml (or web/public/data/missions.json).
    Returns list of SiteRecord objects.
    """
    if data_yaml_or_json is None:
        root = Path(__file__).resolve().parent.parent.parent
        yaml_path = root / "data" / "missions.yaml"
        json_path = root / "web" / "public" / "data" / "missions.json"
        if yaml_path.is_file():
            source_path = yaml_path
        elif json_path.is_file():
            source_path = json_path
        else:
            raise FileNotFoundError(f"Neither {yaml_path} nor {json_path} found.")
    else:
        source_path = Path(data_yaml_or_json)

    if source_path.suffix.lower() in [".yaml", ".yml"]:
        raw_data = yaml.safe_load(source_path.read_text(encoding="utf-8"))
    else:
        raw_data = json.loads(source_path.read_text(encoding="utf-8"))

    registry: List[SiteRecord] = []

    # 1. Missions
    for m in raw_data.get("missions", []):
        mid = m["id"]
        mname = m.get("name", mid)
        site_info = m.get("site", {})
        s_name = site_info.get("name") or mname
        raw_lat = site_info.get("lat")
        raw_lon = site_info.get("lon")
        lat, lon, status = _validate_coords(raw_lat, raw_lon)

        source_urls = [s["url"] for s in m.get("sources", []) if "url" in s]
        tier = site_info.get("terrain_tier") or _infer_terrain_tier(lat)

        rec = SiteRecord(
            id=mid,
            name=f"{mname} ({s_name})" if s_name != mname else mname,
            kind="mission",
            lat=lat,
            lon=lon,
            coord_status=status,
            coord_kind=site_info.get("coord_kind", "unknown"),
            uncertainty_km=site_info.get("uncertainty_km"),
            verified=bool(m.get("verified", False)),
            source_urls=source_urls,
            terrain_tier=tier,
            metadata={
                "provider": m.get("provider"),
                "lander": m.get("lander"),
                "status": m.get("status"),
                "dates": m.get("dates", {}),
                "payload_highlights": m.get("payload_highlights", []),
                "region_type": site_info.get("region_type"),
            },
        )
        registry.append(rec)

    # 2. Reference Sites
    for ref in raw_data.get("reference_sites", []):
        rid = ref["id"]
        rname = ref.get("name", rid)
        raw_lat = ref.get("lat")
        raw_lon = ref.get("lon")
        lat, lon, status = _validate_coords(raw_lat, raw_lon)
        source_urls = [ref["source"]] if "source" in ref else []

        rec = SiteRecord(
            id=rid,
            name=rname,
            kind="reference",
            lat=lat,
            lon=lon,
            coord_status=status,
            coord_kind="reference",
            uncertainty_km=ref.get("uncertainty_km"),
            verified=bool(ref.get("verified", False)),
            source_urls=source_urls,
            terrain_tier=_infer_terrain_tier(lat),
            metadata={"note": ref.get("note")},
        )
        registry.append(rec)

    # 3. Candidate Sites
    for cand in raw_data.get("candidate_sites", []):
        cid = cand["id"]
        cname = cand.get("name", cid)
        raw_lat = cand.get("lat_center")
        raw_lon = cand.get("lon_center")
        lat, lon, status = _validate_coords(raw_lat, raw_lon)

        sources = []
        if cand.get("source_url"):
            sources.append(cand["source_url"])
        if cand.get("source_alt"):
            sources.append(cand["source_alt"])

        rec = SiteRecord(
            id=cid,
            name=cname,
            kind="candidate",
            lat=lat,
            lon=lon,
            coord_status=status,
            coord_kind=cand.get("coordinate_kind") or cand.get("coord_kind") or "candidate_region_center",
            uncertainty_km=cand.get("uncertainty_km"),
            verified=bool(cand.get("verified", False)),
            source_urls=sources,
            terrain_tier=_infer_terrain_tier(lat),
            metadata={
                "region_size_km": cand.get("region_size_km"),
                "source_date": cand.get("source_date"),
                "notes": cand.get("notes"),
            },
        )
        registry.append(rec)

    return registry


def get_valid_sites(data_yaml_or_json: Optional[Path | str] = None) -> List[SiteRecord]:
    """Return only sites with valid coordinates."""
    reg = load_site_registry(data_yaml_or_json)
    return [s for s in reg if s.is_valid()]


def get_skipped_sites(data_yaml_or_json: Optional[Path | str] = None) -> List[SiteRecord]:
    """Return sites with null or invalid coordinates."""
    reg = load_site_registry(data_yaml_or_json)
    return [s for s in reg if not s.is_valid()]


def get_site_by_id(site_id: str, data_yaml_or_json: Optional[Path | str] = None) -> Optional[SiteRecord]:
    """Find a specific site by ID."""
    reg = load_site_registry(data_yaml_or_json)
    for s in reg:
        if s.id == site_id:
            return s
    return None


def create_custom_site(lat: float, lon: float, name: str = "Custom Site") -> SiteRecord:
    """Create a validated custom site record."""
    lat_f, lon_f, status = _validate_coords(lat, lon)
    return SiteRecord(
        id=f"custom-{lat_f:.4f}-{lon_f:.4f}",
        name=name,
        kind="custom",
        lat=lat_f,
        lon=lon_f,
        coord_status=status,
        coord_kind="custom",
        uncertainty_km=None,
        verified=False,
        source_urls=[],
        terrain_tier=_infer_terrain_tier(lat_f),
        metadata={},
    )
