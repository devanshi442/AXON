"""
api/cache.py — Thread-safe bounded LRU scientific result cache for AXON LunarSight.

Ensures that identical expensive ray-marching and SPICE calculations are not repeated,
while strictly invalidating results if model version, kernels, or DEM assets change.
"""

from __future__ import annotations

import collections
import hashlib
import json
import threading
import time
from typing import Any, Dict, Optional, Tuple

try:
    from api.config import CACHE_MAXSIZE, CACHE_TTL_SECONDS, API_VERSION
except ImportError:
    from config import CACHE_MAXSIZE, CACHE_TTL_SECONDS, API_VERSION


class ScientificCache:
    """
    Bounded, thread-safe LRU cache with TTL support and structured key generation.
    """

    def __init__(self, maxsize: int = CACHE_MAXSIZE, ttl_seconds: int = CACHE_TTL_SECONDS):
        self.maxsize = maxsize
        self.ttl_seconds = ttl_seconds
        self._cache: collections.OrderedDict[str, Tuple[float, Any]] = collections.OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0
        self._evictions = 0

    @staticmethod
    def make_key(namespace: str, params: Dict[str, Any], kernel_hash: str = "") -> str:
        """
        Create a deterministic SHA-256 hash key from calculation parameters.
        Includes namespace, API version, kernel identity, and sorted normalized parameters.
        """
        payload = {
            "ns": namespace,
            "version": API_VERSION,
            "kernel_hash": kernel_hash,
            "params": params,
        }
        serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        return f"{namespace}:{digest[:32]}"

    def get(self, key: str) -> Optional[Any]:
        """Retrieve item from cache if present and not expired."""
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None

            timestamp, val = self._cache[key]
            if time.time() - timestamp > self.ttl_seconds:
                del self._cache[key]
                self._misses += 1
                return None

            self._cache.move_to_end(key)
            self._hits += 1
            return val

    def set(self, key: str, value: Any) -> None:
        """Store item in cache with current timestamp, evicting LRU if full."""
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = (time.time(), value)

            if len(self._cache) > self.maxsize:
                self._cache.popitem(last=False)
                self._evictions += 1

    def clear(self) -> int:
        """Clear all cached entries and return the number of items removed."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count

    def stats(self) -> Dict[str, Any]:
        """Return cache health and performance statistics."""
        with self._lock:
            total_lookups = self._hits + self._misses
            hit_ratio = round(self._hits / total_lookups, 4) if total_lookups > 0 else 0.0
            return {
                "size": len(self._cache),
                "maxsize": self.maxsize,
                "ttl_seconds": self.ttl_seconds,
                "hits": self._hits,
                "misses": self._misses,
                "total_lookups": total_lookups,
                "hit_ratio": hit_ratio,
                "evictions": self._evictions,
            }


analysis_cache = ScientificCache(maxsize=CACHE_MAXSIZE, ttl_seconds=CACHE_TTL_SECONDS)
horizon_cache = ScientificCache(maxsize=128, ttl_seconds=CACHE_TTL_SECONDS)
