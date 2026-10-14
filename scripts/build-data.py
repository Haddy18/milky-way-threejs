#!/usr/bin/env python3
"""Prepara los datos de la Vía Láctea a partir de los crudos en data/raw.

Entradas (descárgalas con `scripts/fetch-data.sh` si no están):
  data/raw/hygdata_v41.csv            catálogo HYG v4.1 (119k estrellas, Hipparcos+…)
  data/raw/constellations.lines.json  líneas de constelaciones (d3-celestial, [ra°,dec°])

Salidas (se versionan en data/):
  stars.bin   por estrella 28 B: x,y,z f32 (pc, marco galáctico, Sol en 0,0,0)
              + rgb u8 + size u8 (base de tamaño) + absmag u8 + con u8 + spectIdx u16
              + nameIdx u16 + hip u32 + 2 B de relleno
  names.txt   nombres propios separados por \0 (UTF-8); 0 = sin nombre
  spect.txt   tipos espectrales únicos separados por \0
  conids.txt  abreviaturas de constelación en orden de índice (byte de stars.bin)
  lines.bin   por segmento 12 B: estrellaA u32, estrellaB u32, constelación u8 + 3 B
  cons.json   [{id, cx, cy, cz, n}] centroide (pc) y nº de vértices por constelación

Comprobación de marco: la posición de Sirio debe dar (l, b) ≈ (227,2°, −8,9°).
"""
import csv
import json
import math
import struct
import sys
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = Path(__file__).resolve().parent.parent / "data"

# Ec. ecuatorial → galáctica (J2000): x hacia el ecuador 0/0, y hacia RA 90°, z al NP.
# x_gal hacia el centro galáctico (l=0), z_gal hacia el polo norte galáctico.
M_EQ2GAL = (
    (-0.0548755604, -0.8734370902, -0.4838350155),
    (0.4941094279, -0.4448296300, 0.7469822445),
    (-0.8676661490, -0.1980763734, 0.4559837762),
)

# three.js: X hacia el centro galáctico, Y = polo norte galáctico, Z = -y_gal.
def eq_to_three(x, y, z):
    xg = sum(M_EQ2GAL[0][i] * (x, y, z)[i] for i in range(3))
    yg = sum(M_EQ2GAL[1][i] * (x, y, z)[i] for i in range(3))
    zg = sum(M_EQ2GAL[2][i] * (x, y, z)[i] for i in range(3))
    return xg, zg, -yg


def xyz_to_lb(x, y, z):
    """three → (l, b) en grados, para la comprobación."""
    xg, yg, zg = x, -z, y
    l = math.degrees(math.atan2(yg, xg)) % 360.0
    b = math.degrees(math.asin(max(-1.0, min(1.0, zg / math.hypot(xg, yg, zg)))))
    return l, b


def ang_dist(ra1, de1, ra2, de2):
    """Distancia angular (grados) entre dos puntos (ra°, dec°)."""
    ra1, de1, ra2, de2 = map(math.radians, (ra1, de1, ra2, de2))
    cos = (math.sin(de1) * math.sin(de2)
           + math.cos(de1) * math.cos(de2) * math.cos(ra1 - ra2))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # consola Windows
    OUT.mkdir(exist_ok=True)
    csv_path = RAW / "hygdata_v41.csv"
    lines_path = RAW / "constellations.lines.json"
    for p in (csv_path, lines_path):
        if not p.exists():
            sys.exit(f"ERROR: falta {p} (mira scripts/fetch-data.sh)")

    names = [""]          # índice 0 = sin nombre
    name_idx = {"": 0}
    spectra = [""]         # índice 0 = desconocido
    spect_idx = {"": 0}
    con_ids = []           # índice numérico de constelaciones (para líneas)
    con_idx = {}

    stars = []             # tuplas empaquetadas
    skipped = 0
    sol_row = None
    ra_list, de_list = [], []

    with open(csv_path, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            try:
                dist = float(row["dist"] or 0)
            except ValueError:
                skipped += 1
                continue
            if dist <= 0:
                if row["proper"] == "Sol":
                    sol_row = row
                skipped += 1
                continue
            ra = float(row["ra"] or 0) * 15.0   # ¡HYG v4.1 da ra en HORAS!
            dec = float(row["dec"] or 0)         # dec en grados
            rar = math.radians(ra)
            der = math.radians(dec)
            x = dist * math.cos(der) * math.cos(rar)
            y = dist * math.cos(der) * math.sin(rar)
            z = dist * math.sin(der)
            px, py, pz = eq_to_three(x, y, z)

            try:
                absmag = float(row["absmag"] or 15)
            except ValueError:
                absmag = 15.0
            try:
                ci = float(row["ci"] or 0.7)
            except ValueError:
                ci = 0.7
            # color B−V → RGB por interpolación lineal sobre tablas de clases espectrales
            r8, g8, b8 = bv_rgb(ci)

            # bright → base de tamaño en pantalla (u8, 0-7): las intrínsecamente
            # brillantes dibujan punto más grande; el resto lo decide el shader.
            size = max(0.5, min(7.0, 1.0 + (4.83 - absmag) * 0.42))
            bright = int(round(size / 7.0 * 255))

            absmag_u8 = max(0, min(255, int(round((absmag + 10.0) * 10.0))))
            con = (row["con"] or "").strip()
            if con not in con_idx:
                con_idx[con] = len(con_ids)
                con_ids.append(con)
            con_u8 = con_idx[con] if len(con_ids) < 255 else 255

            sp = (row["spect"] or "").strip()
            if sp not in spect_idx:
                spect_idx[sp] = len(spectra)
                spectra.append(sp)
            sp_u16 = spect_idx[sp]

            proper = (row["proper"] or "").strip()
            if proper:
                if proper not in name_idx:
                    name_idx[proper] = len(names)
                    names.append(proper)
                nm_u16 = name_idx[proper]
            else:
                nm_u16 = 0

            try:
                hip = int(row["hip"] or 0)
            except ValueError:
                hip = 0

            stars.append((px, py, pz, r8, g8, b8, bright, absmag_u8,
                          con_u8, sp_u16, nm_u16, hip))
            ra_list.append(ra)
            de_list.append(dec)

            if proper == "Sirius":
                l, b = xyz_to_lb(px, py, pz)
                print(f"comprobación marco → Sirio: l={l:.1f}° b={b:.1f}° "
                      f"(esperado ~227,2 / −8,9)")
                if abs(l - 227.2) > 1.5 or abs(b + 8.9) > 1.5:
                    sys.exit("ERROR: la rotación ecuatorial→galáctica no cuadra")

    print(f"estrellas: {len(stars)} · descartadas (dist≤0, p.ej. el Sol): {skipped}")
    print(f"nombres: {len(names) - 1} · tipos espectrales: {len(spectra) - 1} "
          f"· constelaciones en catálogo: {len(con_ids)}")

    # ── stars.bin ────────────────────────────────────────────
    with open(OUT / "stars.bin", "wb") as fh:
        pack = struct.Struct("<fffBBBBBBHHIxx").pack  # 28 B
        for s in stars:
            fh.write(pack(*s))
    print(f"stars.bin: {len(stars) * 28 / 1e6:.2f} MB")

    (OUT / "names.txt").write_text("\0".join(names), encoding="utf-8")
    (OUT / "spect.txt").write_text("\0".join(spectra), encoding="utf-8")
    (OUT / "conids.txt").write_text("\0".join(con_ids), encoding="utf-8")

    # ── líneas de constelaciones: cada vértice → estrella real ──
    raw_lines = json.loads(lines_path.read_text(encoding="utf-8"))
    segments = []          # (a_idx, b_idx, con_u8)
    cons_out = []
    fails = 0
    total_pts = 0
    for feat in raw_lines["features"]:
        cid = feat["id"]
        if cid not in con_idx:            # constelación sin estrellas del catálogo
            continue
        c = con_idx[cid]
        pts_idx = []
        for line in feat["geometry"]["coordinates"]:
            snapped = []
            for ra, de in line:
                total_pts += 1
                # ventana de candidatos por declinación y luego el más cercano
                best, best_d = None, 1e9
                for i in range(len(stars)):
                    if abs(de_list[i] - de) > 2.5:
                        continue
                    d = ang_dist(ra, de, ra_list[i], de_list[i])
                    if d < best_d:
                        best, best_d = i, d
                if best is not None and best_d <= 1.0:
                    snapped.append(best)
                else:
                    fails += 1
            for a, b in zip(snapped, snapped[1:]):
                if a != b:
                    segments.append((a, b, c))
            pts_idx.extend(snapped)
        if pts_idx:
            cx = sum(stars[i][0] for i in pts_idx) / len(pts_idx)
            cy = sum(stars[i][1] for i in pts_idx) / len(pts_idx)
            cz = sum(stars[i][2] for i in pts_idx) / len(pts_idx)
            cons_out.append({"id": cid, "cx": cx, "cy": cy, "cz": cz,
                             "n": len(set(pts_idx))})

    with open(OUT / "lines.bin", "wb") as fh:
        pack = struct.Struct("<IIB3x").pack  # 12 B
        for a, b, c in segments:
            fh.write(pack(a, b, c))
    (OUT / "cons.json").write_text(
        json.dumps(cons_out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    pct = 100.0 * fails / max(1, total_pts)
    print(f"líneas: {len(segments)} segmentos · {len(cons_out)} constelaciones · "
          f"vértices sin estrella: {fails}/{total_pts} ({pct:.1f}%)")
    if pct > 5:
        sys.exit("ERROR: demasiados vértices sin estrella cercana; revisa el formato")


def bv_rgb(ci):
    """Color de estrella por índice de color B−V (tablas de clases espectrales,
    interpolación lineal entre anclas)."""
    anchors = [
        (-0.40, (155, 176, 255)), (-0.15, (162, 185, 255)), (0.00, (185, 200, 255)),
        (0.15, (209, 217, 255)), (0.30, (228, 232, 255)), (0.45, (248, 247, 255)),
        (0.58, (255, 251, 235)), (0.68, (255, 244, 215)), (0.82, (255, 232, 185)),
        (0.97, (255, 210, 150)), (1.15, (255, 180, 120)), (1.45, (255, 140, 95)),
        (1.70, (255, 110, 80)), (2.00, (245, 95, 70)),
    ]
    ci = max(-0.40, min(2.0, ci))
    for i in range(1, len(anchors)):
        c0, col0 = anchors[i - 1]
        c1, col1 = anchors[i]
        if ci <= c1:
            t = (ci - c0) / (c1 - c0)
            return tuple(int(round(col0[k] + (col1[k] - col0[k]) * t)) for k in range(3))
    return anchors[-1][1]


if __name__ == "__main__":
    main()
