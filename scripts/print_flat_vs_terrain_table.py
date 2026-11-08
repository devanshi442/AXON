import json
import glob

def print_table():
    files = sorted(glob.glob('web/public/data/summary/*.json'))
    header = f"| {'Site ID':32s} | {'Lat':6s} | {'Lon':7s} | {'Flat Sun %':10s} | {'Terrain Sun %':13s} | {'Diff Sun %':10s} | {'Flat DTE %':10s} | {'Terrain DTE %':13s} |"
    sep = '|' + '-'*34 + '|' + '-'*8 + '|' + '-'*9 + '|' + '-'*12 + '|' + '-'*15 + '|' + '-'*12 + '|' + '-'*12 + '|' + '-'*15 + '|'
    print(header)
    print(sep)

    for fpath in files:
        with open(fpath) as f:
            d = json.load(f)
        sid = d['site_id']
        lat = d['lat']
        lon = d['lon']
        flat_sun = d['flat']['sun']['percentage']
        terr_sun = d['terrain']['sun']['percentage']
        diff_sun = terr_sun - flat_sun
        flat_dte = d['flat']['earth']['percentage']
        terr_dte = d['terrain']['earth']['percentage']
        row = f"| {sid:32s} | {lat:6.2f} | {lon:7.2f} | {flat_sun:9.2f}% | {terr_sun:12.2f}% | {diff_sun:+9.2f}% | {flat_dte:9.2f}% | {terr_dte:12.2f}% |"
        print(row)

if __name__ == "__main__":
    print_table()
