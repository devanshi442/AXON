import numpy as np
from lunarsight_core import sites, horizon, geometry as G, visibility, terrain

def question_1():
    print("=================== QUESTION 1 ===================")
    target_ids = ['mons-mouton-summit', 'cs-shackleton-rim', 'cs-haworth']
    all_sites = {s.id: s for s in sites.get_valid_sites()}

    for sid in target_ids:
        s = all_sites.get(sid)
        if not s:
            print(f"Site {sid} not found in registry!")
            continue
        lat, lon = s.lat, s.lon
        name = s.name
        print(f"Site: {sid} ({name}) [lat: {lat}, lon: {lon}]")
        for mast_h in [0.0, 1.5]:
            mask_data = horizon.compute_horizon(lat, lon, observer_height_m=mast_h)
            mask = np.array(mask_data['mask_deg'])
            dem_id = mask_data['dem_id']
            print(f"  mast {mast_h} m: min = {np.min(mask):+.3f} deg, max = {np.max(mask):+.3f} deg, mean = {np.mean(mask):+.3f} deg (DEM: {dem_id})")

if __name__ == "__main__":
    question_1()
