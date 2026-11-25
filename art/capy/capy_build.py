"""Build the Capy mascot: mesh, facial variants, props, rig and materials.

Run headless:
  blender -b --factory-startup --python-exit-code 1 -P art/capy/capy_build.py -- --out art/capy/capy.blend

Conventions: 1 unit = 1 m, character faces -Y, Z up, sitting height ~1.0 m without hat.
`.L` is the character's left (+X, the viewer's right in front view).
Every visible part is rigidly weighted to one bone. Expression variants and props are
switched by bone scale (0 = hidden), which exports to glTF and plays in three.js.
The watering can exists twice: skinned to the `can` bone for the clips that hold it, and as the
static `WateringCan` node (hidden in renders) that the app places in the world.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/capy free of __pycache__
sys.path.insert(0, HERE)
import capy_geo as G  # noqa: E402

PAL = {
    "fur": "#E8A460", "fur_light": "#F8D3A3", "muzzle": "#B07148", "paw": "#9E643C",
    "ear_out": "#D9925A", "ear_in": "#8A5233", "ink": "#24150B", "brow": "#4A2C18", "white": "#FFFFFF",
    "toe": "#6E4428", "mouth": "#6E2A26", "tongue": "#F38C84", "teeth": "#FFF8EE", "blush": "#F7837A",
    "beret": "#F6B8BC", "beret_stem": "#E39CA0", "gold": "#F2C14E", "gem_pink": "#F27C93", "gem_blue": "#7EC8F2",
    "gem_mint": "#7FD6B0", "scarf_a": "#6FA3DB", "scarf_b": "#F5F8FC", "tear": "#7FC4F2", "sweat": "#93D2F5",
    "anger": "#E5484D", "steam": "#FFFFFF", "zzz": "#9C8ADE", "bubble": "#CFEAFF", "spark": "#FFD24F",
    "heart": "#F2708B", "cloud": "#9DAAC0", "drop": "#86C1EE", "snow": "#E4F4FF", "exclaim": "#F2665A", "question": "#8B7BEA",
    "paper": "#FCF1DC", "paper_shade": "#E6D0AE", "paper_line": "#C9AF8A", "pencil": "#F7C948",
    "eraser": "#F4A3A8", "ferrule": "#C3C9D2", "wood": "#F2D4A7", "lead": "#3A3A3A",
    "yuzu": "#F7B32F", "leaf": "#86BC62", "stem": "#7A5230",
}
C = {k: G.col(v) for k, v in PAL.items()}

HEAD_C = Vector((0.0, -0.03, 0.70))
MUZ_C = Vector((0.0, -0.315, 0.592))
BODY_C = Vector((0.0, 0.03, 0.27))
UP = Vector((0, 0, 1))

EYE_UNIT = 0.057
MOUTH_UNIT = 0.042
SIDES = (("L", 1.0), ("R", -1.0))

EYE_VARIANTS = ("open", "happy", "closed", "squint", "sad", "angry", "sleepy", "star", "wide")
MOUTH_VARIANTS = ("smile", "open", "frown", "o", "wavy", "grr", "tongue", "smirk")

BONES = {}      # name -> dict(head, tail, up, parent)
MAT_SETUP = {}  # material name -> kind


def bone(name, head, tail, parent, up=None):
    BONES[name] = dict(head=Vector(head), tail=Vector(tail), parent=parent, up=Vector(up) if up is not None else None)


def oriented(y_dir, up=UP):
    """Rotation matrix whose local +Y follows y_dir and local +Z leans to `up`."""
    y = Vector(y_dir).normalized()
    z = (Vector(up) - y * Vector(up).dot(y))
    if z.length < 1e-6:
        z = y.orthogonal()
    z.normalize()
    x = y.cross(z)
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = x[i], y[i], z[i]
    return m


def aim_z(z_dir):
    """Rotation matrix taking local +Z onto z_dir (shortest arc)."""
    return Vector((0, 0, 1)).rotation_difference(Vector(z_dir)).to_matrix().to_4x4()


# ============================================================================ body parts
def build_body(acc):
    def head_fn(d):
        p = HEAD_C + Vector((d.x * 0.40, d.y * 0.355, d.z * 0.33))
        for s in (-1, 1):
            p = G.bump(p, HEAD_C, Vector((s * 0.25, -0.24, 0.60)), 0.045, 0.11)
        if p.z > 0.95:
            p.z = 0.95 + (p.z - 0.95) * 0.75
        return p

    head = G.shaped(20, head_fn)
    surf_head = G.Surface(head)
    acc.add(head, C["fur"], "M_Toy", "head", part="head")

    muzzle = G.ellipsoid(12, (0.172, 0.172, 0.158), MUZ_C, e=2.15)
    surf_muzzle = G.Surface(muzzle)
    acc.add(muzzle, C["muzzle"], "M_Toy", "head", part="muzzle")

    def body_fn(d):
        w = 1 + 0.10 * (-d.z)
        p = BODY_C + Vector((d.x * 0.36 * w, d.y * 0.33 * w, d.z * 0.31))
        for s in (-1, 1):
            p = G.bump(p, BODY_C, Vector((s * 0.21, -0.12, 0.10)), 0.06, 0.10)
        p.z = G.softfloor(p.z, 0.015, 0.02)
        return p

    body = G.shaped(16, body_fn)
    surf_body = G.Surface(body)
    acc.add(body, C["fur"], "M_Toy", "torso", part="body")

    P0, n, u = surf_body.anchor(BODY_C + Vector((0, 0, 0.0)), (0, -1, -0.04))
    belly = G.decal(surf_body, P0, n, u, G.polar_from_outline(G.ellipse_outline(1.0, 1.12, segs=48), rings=5),
                    0.148, offset=0.0016, skirt=0.003)
    acc.add(belly, C["fur_light"], "M_Toy", "torso", part="belly")

    bone("root", (0, 0, 0), (0, 0, 0.18), None)
    bone("body", (0, 0, 0.02), (0, 0, 0.30), "root")
    bone("torso", (0, 0.03, 0.02), (0, 0.03, 0.52), "body", up=(0, -1, 0))
    bone("head", (0, -0.02, 0.45), (0, -0.02, 0.92), "body", up=(0, -1, 0))

    # ears
    for side, s in SIDES:
        M = Matrix.Translation(Vector((s * 0.285, 0.05, 0.995))) @ Matrix.Rotation(s * math.radians(30), 4, "Y") \
            @ Matrix.Rotation(math.radians(-6), 4, "X")
        outer = G.ellipsoid(7, (0.09, 0.048, 0.10), e=2.2, matrix=M)
        inner = G.ellipsoid(5, (0.056, 0.022, 0.064), (0, -0.033, -0.006), matrix=M)
        acc.add(outer, C["ear_out"], "M_Toy", f"ear.{side}", part="ears")
        acc.add(inner, C["ear_in"], "M_Toy", f"ear.{side}", part="ears")
        bone(f"ear.{side}", M @ Vector((0, 0, -0.07)), M @ Vector((0, 0, 0.07)), "head", up=(0, -1, 0))

    # arms + paws
    for side, s in SIDES:
        sh = Vector((s * 0.235, -0.15, 0.43))
        d = Vector((-s * 0.36, -0.62, -0.70)).normalized()
        R = oriented(d, (0, -1, 0))
        M = Matrix.Translation(sh) @ R
        arm = G.transform(G.capsule(0.07, 0.07, segs=12, rings=3), M @ Matrix.Translation((0, -0.035, 0)))
        paw = G.ellipsoid(7, (0.066, 0.064, 0.062), (0, 0.18, 0), matrix=M)
        acc.add(arm, C["fur"], "M_Toy", f"arm.{side}", part="arms")
        acc.add(paw, C["paw"], "M_Toy", f"arm.{side}", part="arms")
        bone(f"arm.{side}", sh, sh + d * 0.18, "body", up=(0, -1, 0))

    # feet with toe creases
    for side, s in SIDES:
        M = Matrix.Translation(Vector((s * 0.17, -0.25, 0.055))) @ Matrix.Rotation(s * math.radians(14), 4, "Z")
        foot = G.ellipsoid(8, (0.085, 0.12, 0.062), matrix=M)
        surf_foot = G.Surface(foot)
        acc.add(foot, C["paw"], "M_Toy", f"foot.{side}", part="feet")
        fc = M @ Vector((0, 0, 0))
        for k in (-1, 1):
            P0, n, u = surf_foot.anchor(fc, (M.to_3x3() @ Vector((k * 0.28, -1, 0.75))), up=(M.to_3x3() @ Vector((0, -1, 0))))
            crease = G.decal(surf_foot, P0, n, u, G.stroke([(0, -0.5), (0, 0.5)], 0.32), 0.03, offset=0.0012, skirt=0.002)
            acc.add(crease, C["toe"], "M_Toy", f"foot.{side}", part="feet")
        bone(f"foot.{side}", M @ Vector((0, 0.06, 0)), M @ Vector((0, -0.08, 0)), "root")

    return surf_head, surf_muzzle


# ============================================================================ face
def eye_offset(x, y, rx=0.8, ry=1.0, base=0.0022, dome=0.0045):
    q = (x / rx) ** 2 + (y / ry) ** 2
    return base + dome * max(0.0, 1.0 - q)


def eye_shapes():
    """Shapes for the viewer-left eye (character's right). +x is the inner (nose) side."""
    S = {}
    S["open"] = [("ink", G.polar_from_outline(G.ellipse_outline(0.8, 1.0, segs=32), rings=3), None)]
    S["wide"] = [("ink", G.polar_from_outline(G.ellipse_outline(0.92, 1.15, segs=32), rings=3), (0.92, 1.15))]
    S["sad"] = [("ink", G.polar_from_outline(
        G.ellipse_outline(0.8, 1.0, center=(0.0, -0.25), segs=32, cuts=((0.52, 0.55),)), center=(0.0, -0.25), rings=3), None)]
    S["angry"] = [("ink", G.polar_from_outline(
        G.ellipse_outline(0.8, 1.0, center=(0.0, -0.3), segs=32, cuts=((0.40, -0.62),)), center=(0.0, -0.3), rings=3), None)]
    S["sleepy"] = [
        ("ink", G.polar_from_outline(G.ellipse_outline(0.8, 1.0, center=(0.0, -0.4), segs=32, cuts=((0.02, 0.0),)),
                                     center=(0.0, -0.4), rings=3), None),
        ("ink", G.stroke([(x, 0.02 + 0.07 * (1 - (x / 1.0) ** 2)) for x in [-1.0 + 0.1 * i for i in range(21)]], 0.24), "lid"),
    ]
    S["star"] = [("ink", G.polar_from_outline(G.ellipse_outline(0.8, 1.0, segs=32), rings=3), None)]
    S["happy"] = [("ink", G.stroke([(x, 0.22 - 0.78 * (x / 0.86) ** 2) for x in [-0.86 + 0.086 * i for i in range(21)]], 0.30), "flat")]
    S["closed"] = [("ink", G.stroke([(x, -0.22 + 0.48 * (x / 0.86) ** 2) for x in [-0.86 + 0.086 * i for i in range(21)]], 0.26), "flat")]
    # squint ">" for the viewer-left eye: point toward the nose (+x)
    S["squint"] = [
        ("ink", G.stroke([(-0.62, 0.62), (0.5, 0.02)], 0.28), "flat"),
        ("ink", G.stroke([(0.5, -0.02), (-0.62, -0.62)], 0.28), "flat2"),
    ]
    return S


def highlights(variant):
    """White highlights in viewer coordinates (not mirrored), on top of the eye dome."""
    if variant in ("open", "sad", "angry"):
        return [("circle", (-0.30, 0.38), 0.30), ("circle", (0.30, -0.42), 0.13)]
    if variant == "wide":
        return [("circle", (-0.36, 0.48), 0.19), ("circle", (0.34, -0.50), 0.09)]
    if variant == "sleepy":
        return [("circle", (-0.30, -0.30), 0.14)]
    if variant == "star":
        return [("sparkle", (0.0, 0.06), 0.70, "spark"), ("circle", (-0.36, 0.52), 0.12), ("circle", (0.40, -0.56), 0.09)]
    return []


def build_face(acc, surf_head, surf_muzzle):
    shapes = eye_shapes()
    eye_frames = {}
    for side, s in SIDES:
        P0, n, u = surf_head.anchor(HEAD_C, (s * 0.53, -0.80, 0.20))
        eye_frames[side] = (P0, n, u)
        bone(f"eye.{side}", P0, P0 + n * 0.04, "head", up=u)
        for variant in EYE_VARIANTS:
            bname = f"eye_{variant}.{side}"
            bone(bname, P0, P0 + n * 0.035, f"eye.{side}", up=u)
            radii = None
            for k, (cname, shape, tag) in enumerate(shapes[variant]):
                if isinstance(tag, tuple):
                    radii = tag
                sh = G.mirror2d(shape) if s > 0 else shape
                if tag in ("flat", "flat2"):
                    off = 0.0026 + (0.0004 if tag == "flat2" else 0.0)
                    bm = G.decal(surf_head, P0, n, u, sh, EYE_UNIT, offset=off, skirt=0.003)
                elif tag == "lid":
                    bm = G.decal(surf_head, P0, n, u, sh, EYE_UNIT, skirt=0.003,
                                 offset_fn=lambda x, y: eye_offset(x, y) + 0.0005)
                else:
                    rx, ry = radii or (0.8, 1.0)
                    bm = G.decal(surf_head, P0, n, u, sh, EYE_UNIT, skirt=0.003,
                                 offset_fn=lambda x, y, rx=rx, ry=ry: eye_offset(x, y, rx, ry))
                acc.add(bm, C[cname], "M_Eye", bname, part="eyes")
            rx, ry = radii or (0.8, 1.0)
            for hl in highlights(variant):
                kind, (hx, hy), size = hl[:3]
                hcol = C[hl[3]] if len(hl) > 3 else C["white"]
                outline = G.ellipse_outline(size, size, segs=16, ex=0, ey=0) if kind == "circle" else \
                    [(x * size, y * size) for (x, y) in G.sparkle_outline(40)]
                shape = G.xform2d(G.polar_from_outline(outline, rings=2), dx=hx, dy=hy)
                bm = G.decal(surf_head, P0, n, u, shape, EYE_UNIT, skirt=0.0,
                             offset_fn=lambda x, y, rx=rx, ry=ry: eye_offset(x, y, rx, ry) + 0.0009)
                acc.add(bm, hcol, "M_Eye", bname, part="eyes")

        # brow
        r = u.cross(n)
        target = P0 + u * (EYE_UNIT * 1.85) + r * (-s * EYE_UNIT * 0.15)
        Pb, nb, ub = surf_head.anchor(HEAD_C, target - HEAD_C)
        brow_pts = [(x, 0.10 * (1 - (x / 0.55) ** 2)) for x in [-0.55 + 0.055 * i for i in range(21)]]
        bm = G.decal(surf_head, Pb, nb, ub, G.stroke(brow_pts, 0.33, taper=lambda t: 0.8 + 0.35 * math.sin(math.pi * t)),
                     0.066, offset=0.0022, skirt=0.003)
        acc.add(bm, C["brow"], "M_Toy", f"brow.{side}", part="brows")
        bone(f"brow.{side}", Pb, Pb + nb * 0.03, "head", up=ub)

        # blush (soft alpha texture)
        Pc, nc, uc = surf_head.anchor(HEAD_C, (s * 0.66, -0.70, -0.08))
        blush = G.decal(surf_head, Pc, nc, uc, G.polar_from_outline(G.ellipse_outline(1.0, 0.62, segs=32), rings=3),
                        0.078, offset=0.0042, skirt=0.0, uv_scale=(1.0, 0.62))
        acc.add(blush, (1, 1, 1, 1), "M_Blush", f"blush.{side}", part="blush")
        bone(f"blush.{side}", Pc, Pc + nc * 0.03, "head", up=uc)

    # nostrils + philtrum on the muzzle
    for side, s in SIDES:
        Pn, nn, un = surf_muzzle.anchor(MUZ_C, (s * 0.36, -1.0, 0.74))
        shape = G.xform2d(G.polar_from_outline(G.ellipse_outline(0.40, 1.0, segs=28), rings=2), rot=-s * 0.62)
        bm = G.decal(surf_muzzle, Pn, nn, un, shape, 0.017, offset=0.0018, skirt=0.003)
        acc.add(bm, C["ink"], "M_Toy", "head", part="nose")
        if side == "R":
            bone("bubble", Pn + nn * 0.004, Pn + nn * 0.05, "head", up=un)

    Pm, nm, um = surf_muzzle.anchor(MUZ_C, (0.0, -1.0, -0.30))
    bone("mouth", Pm, Pm + nm * 0.04, "head", up=um)
    philtrum = G.decal(surf_muzzle, Pm, nm, um, G.stroke([(0, 0.12), (0, 1.30)], 0.20), MOUTH_UNIT, offset=0.0018, skirt=0.003)
    acc.add(philtrum, C["ink"], "M_Toy", "head", part="nose")

    def mouth_add(variant, cname, shape, offset=0.0018, mat="M_Toy", skirt=0.003):
        # +0.8 mm keeps every layer clear of the muzzle when the mouth bone slides/scales on the curve
        bm = G.decal(surf_muzzle, Pm, nm, um, shape, MOUTH_UNIT, offset=offset + 0.0008, skirt=skirt + 0.0008)
        acc.add(bm, C[cname], mat, f"mouth_{variant}", part="mouth")

    for v in MOUTH_VARIANTS:
        bone(f"mouth_{v}", Pm, Pm + nm * 0.035, "mouth", up=um)

    lobe = [(-0.86 * t, 0.13 - 0.52 * math.sin(math.pi * t) - 0.02 * t) for t in [i / 16 for i in range(17)]]
    # smile "w": two lobes meeting under the philtrum
    mouth_add("smile", "ink", G.stroke(lobe, 0.21))
    mouth_add("smile", "ink", G.mirror2d(G.stroke(lobe, 0.21)), offset=0.0022)
    # open laugh: D shape + tongue + two incisors
    d_out = G.ellipse_outline(0.80, 1.18, center=(0, -0.42), segs=40, ex=0, ey=0.14, cuts=((0.14, 0.0),))
    mouth_add("open", "mouth", G.polar_from_outline(d_out, center=(0, -0.42), rings=3))
    tongue = G.ellipse_outline(0.46, 0.30, center=(0, -0.72), segs=28, ex=0, ey=-0.72, cuts=())
    mouth_add("open", "tongue", G.polar_from_outline(tongue, center=(0, -0.72), rings=2), offset=0.0023, skirt=0.002)
    for k in (-1, 1):
        tooth = G.xform2d(G.polar_from_outline(G.ellipse_outline(0.13, 0.20, segs=20, cuts=((0.10, 0.0),)), rings=2),
                          dx=k * 0.145, dy=0.02)
        mouth_add("open", "teeth", tooth, offset=0.0023, skirt=0.002)
    # frown
    frown = [(x, -0.36 + 0.42 * (1 - (x / 0.62) ** 2)) for x in [-0.62 + 0.062 * i for i in range(21)]]
    mouth_add("frown", "ink", G.stroke(frown, 0.21))
    # o (surprise / snore)
    mouth_add("o", "mouth", G.polar_from_outline(G.ellipse_outline(0.34, 0.44, center=(0, -0.36), segs=28, ey=-0.36),
                                                  center=(0, -0.36), rings=2))
    # wavy (worried / chattering)
    wav = [(x, -0.30 + 0.13 * math.sin(x * math.pi * 2.4)) for x in [-0.82 + 0.041 * i for i in range(41)]]
    mouth_add("wavy", "ink", G.stroke(wav, 0.20))
    # grr: flat pout with two buck teeth
    grr = [(x, -0.10 - 0.16 * (x / 0.78) ** 2) for x in [-0.78 + 0.078 * i for i in range(21)]]
    mouth_add("grr", "ink", G.stroke(grr, 0.21))
    for k in (-1, 1):
        tooth = G.xform2d(G.polar_from_outline(G.ellipse_outline(0.13, 0.22, segs=20, cuts=((0.12, 0.0),)), rings=2),
                          dx=k * 0.145, dy=-0.24)
        mouth_add("grr", "teeth", tooth, offset=0.0010, skirt=0.003)
    # tongue (concentration blep)
    mouth_add("tongue", "ink", G.stroke(lobe, 0.21))
    mouth_add("tongue", "ink", G.mirror2d(G.stroke(lobe, 0.21)), offset=0.0022)
    blep = G.ellipse_outline(0.22, 0.30, center=(0.48, -0.50), segs=24, ex=0.48, ey=-0.50)
    mouth_add("tongue", "tongue", G.polar_from_outline(blep, center=(0.48, -0.50), rings=2), offset=0.0026, skirt=0.002)
    # smirk: small left lobe, right side rising
    smirk_r = [(0.92 * t, 0.13 - 0.30 * math.sin(math.pi * t * 0.8) + 0.50 * t * t) for t in [i / 16 for i in range(17)]]
    mouth_add("smirk", "ink", G.stroke([(-0.5 * t, 0.13 - 0.28 * math.sin(math.pi * t)) for t in [i / 12 for i in range(13)]], 0.16))
    mouth_add("smirk", "ink", G.stroke(smirk_r, 0.17), offset=0.0022)

    return eye_frames


# ============================================================================ props
def build_props(acc, surf_head, eye_frames):
    # beret (default hat)
    Mb = Matrix.Translation((0.03, 0.0, 1.0)) @ Matrix.Rotation(math.radians(10), 4, "Y") @ Matrix.Rotation(math.radians(-7), 4, "X")
    acc.add(G.ellipsoid(10, (0.255, 0.255, 0.088), (0, 0, 0.03), matrix=Mb), C["beret"], "M_Toy", "beret", part="beret")
    acc.add(G.transform(G.cylinder(0.022, 0.06, segs=12, top_radius=0.016), Mb @ Matrix.Translation((0, 0, 0.10))),
            C["beret_stem"], "M_Toy", "beret", part="beret")
    bone("beret", Mb @ Vector((0, 0, 0)), Mb @ Vector((0, 0, 0.12)), "head", up=(0, -1, 0))

    # crown (proud)
    Mc = Matrix.Translation((0.0, -0.01, 0.975))
    parts = [G.transform(G.cylinder(0.155, 0.075, segs=32, top_radius=0.16), Mc)]
    for i in range(5):
        a = math.radians(90 + i * 72)
        x, y = math.cos(a) * 0.138, -math.sin(a) * 0.138
        parts.append(G.transform(G.cylinder(0.042, 0.105, segs=12, top_radius=0.0), Mc @ Matrix.Translation((x, y, 0.06))))
        parts.append(G.ellipsoid(3, (0.022, 0.022, 0.022), Mc @ Vector((x, y, 0.17))))
    acc.add(G.merge(*parts), C["gold"], "M_Gold", "crown", part="crown")
    for x, cname in ((-0.075, "gem_blue"), (0.0, "gem_pink"), (0.075, "gem_mint")):
        yy = -math.sqrt(max(0.157 ** 2 - x * x, 0.0)) - 0.004
        acc.add(G.ellipsoid(3, (0.02, 0.012, 0.02), Mc @ Vector((x, yy, 0.038))), C[cname], "M_Gloss", "crown", part="crown")
    bone("crown", Mc @ Vector((0, 0, 0)), Mc @ Vector((0, 0, 0.15)), "head", up=(0, -1, 0))

    # yuzu balanced on the beret (happy, a real capybara habit)
    My = Matrix.Translation((0.045, 0.01, 1.165))
    acc.add(G.ellipsoid(7, (0.075, 0.075, 0.066), matrix=My), C["yuzu"], "M_Gloss", "yuzu", part="yuzu")
    acc.add(G.transform(G.cylinder(0.008, 0.025, segs=8), My @ Matrix.Translation((0, 0, 0.058))), C["stem"], "M_Toy", "yuzu", part="yuzu")
    acc.add(G.ellipsoid(5, (0.045, 0.011, 0.020), matrix=My @ Matrix.Translation((0.035, 0, 0.075)) @ Matrix.Rotation(math.radians(25), 4, "Y")),
            C["leaf"], "M_Toy", "yuzu", part="yuzu")
    bone("yuzu", My @ Vector((0, 0, -0.06)), My @ Vector((0, 0, 0.08)), "head", up=(0, -1, 0))

    # scarf (freeze used): striped ring + hanging tail
    Ms = Matrix.Translation((0.0, -0.01, 0.50)) @ Matrix.Rotation(math.radians(8), 4, "X")
    nseg = 12
    for i in range(nseg):
        a0, a1 = math.tau * i / nseg, math.tau * (i + 1) / nseg
        seg = G.transform(G.torus_segment(0.272, 0.072, a0, a1, segs=4, rsegs=10, ry_scale=0.93), Ms)
        acc.add(seg, C["scarf_a"] if i % 2 == 0 else C["scarf_b"], "M_Toy", "scarf", part="scarf")
    bone("scarf", Ms @ Vector((0, 0, 0)), Ms @ Vector((0, 0, 0.1)), "body", up=(0, -1, 0))
    Mt = Matrix.Translation((0.13, -0.285, 0.47)) @ Matrix.Rotation(math.radians(-14), 4, "Y") @ Matrix.Rotation(math.radians(12), 4, "X")
    for k in range(3):
        piece = G.box((0.125, 0.042, 0.085), center=(0, 0, -0.045 - k * 0.085), bevel_div=1.5)
        acc.add(G.transform(piece, Mt), C["scarf_a"] if k % 2 == 0 else C["scarf_b"], "M_Toy", "scarf_tail", part="scarf")
    bone("scarf_tail", Mt @ Vector((0, 0, 0)), Mt @ Vector((0, 0, -0.2)), "scarf", up=(0, -1, 0))

    # tears (sad) at the outer lower corner of each eye
    for side, s in SIDES:
        P0, n, u = eye_frames[side]
        r = u.cross(n)
        outer = r * (s * 1.0)
        pos = P0 + outer * EYE_UNIT * 0.85 - u * EYE_UNIT * 1.25 + n * 0.012
        Mtr = Matrix.Translation(pos) @ oriented(-n, u) @ Matrix.Rotation(math.radians(0), 4, "Y")
        drop = G.puffy([(x * 0.62, y) for (x, y) in G.drop_outline(26)], 0.55)
        drop = G.transform(drop, Mtr @ Matrix.Scale(0.036, 4))
        acc.add(drop, C["tear"], "M_Gloss", f"tear.{side}", part="tears")
        bone(f"tear.{side}", pos, pos - u * 0.04, "head", up=n)

    # sweat drop at the temple
    Pt, nt, ut = surf_head.anchor(HEAD_C, (0.80, -0.38, 0.42))
    pos = Pt + nt * 0.035
    drop = G.transform(G.puffy([(x * 0.62, y) for (x, y) in G.drop_outline(26)], 0.5),
                       Matrix.Translation(pos) @ oriented(-nt, UP) @ Matrix.Scale(0.045, 4))
    acc.add(drop, C["sweat"], "M_Gloss", "sweat", part="sweat")
    acc.add(G.ellipsoid(4, (0.009, 0.006, 0.014), pos + Vector((-0.012, -0.03, 0.002))), C["white"], "M_Gloss", "sweat", part="sweat")
    bone("sweat", pos, pos + Vector((0, 0, 0.05)), "head", up=(0, -1, 0))

    # anger mark (cross-popping vein), floating at the upper corner of the head
    Pa = Vector((0.33, -0.24, 1.06))
    arcs = []
    for qx, qy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        cxy = (qx * 0.050, qy * 0.050)
        a0 = math.atan2(-qy, -qx)
        pts = []
        for k in range(9):
            a = a0 - math.pi / 4 + (math.pi / 2) * k / 8
            pts.append((Pa.x + cxy[0] + math.cos(a) * 0.036, Pa.y, Pa.z + cxy[1] + math.sin(a) * 0.036))
        arcs.append(G.tube(pts, 0.0115, segs=6))
    acc.add(G.merge(*arcs), C["anger"], "M_Gloss", "anger", part="anger")
    bone("anger", Pa, Pa + Vector((0, 0, 0.06)), "head", up=(0, -1, 0))

    # steam puffs (grumpy) beside the head
    for side, s in SIDES:
        base = Vector((s * 0.47, -0.06, 0.86))
        puff = G.merge(G.ellipsoid(4, (0.05, 0.045, 0.045), base),
                       G.ellipsoid(4, (0.038, 0.035, 0.035), base + Vector((s * 0.045, 0, 0.03))),
                       G.ellipsoid(3, (0.032, 0.03, 0.03), base + Vector((s * 0.02, 0, -0.035))))
        acc.add(puff, C["steam"], "M_Toy", f"puff.{side}", part="puffs")
        bone(f"puff.{side}", base - Vector((s * 0.06, 0, 0)), base + Vector((s * 0.05, 0, 0)), "head", up=(0, -1, 0))

    # Zzz (sleepy)
    for i, (pos, size) in enumerate((((0.37, -0.16, 1.09), 0.050), ((0.47, -0.13, 1.19), 0.040), ((0.55, -0.10, 1.28), 0.032))):
        p = Vector(pos)
        pts = [(p.x - size, p.y, p.z + size), (p.x + size, p.y, p.z + size), (p.x - size, p.y, p.z - size), (p.x + size, p.y, p.z - size)]
        dense = []
        for a, b in zip(pts[:-1], pts[1:]):
            for k in range(6):
                dense.append(Vector(a).lerp(Vector(b), k / 6))
        dense.append(Vector(pts[-1]))
        acc.add(G.tube(dense, size * 0.2, segs=6), C["zzz"], "M_Toy", f"z{i + 1}", part="zzz")
        bone(f"z{i + 1}", p, p + Vector((0, 0, 0.05)), "head", up=(0, -1, 0))

    # snot bubble (sleepy) at the viewer-left nostril
    b = BONES["bubble"]
    bn = (b["tail"] - b["head"]).normalized()
    center = b["head"] + bn * 0.042
    acc.add(G.ellipsoid(7, (0.042, 0.042, 0.042), center), C["bubble"], "M_Glass", "bubble", part="bubble")
    acc.add(G.ellipsoid(4, (0.009, 0.006, 0.012), center + Vector((-0.016, -0.036, 0.016))), C["white"], "M_Gloss", "bubble", part="bubble")

    # notebook + pencil (focused writing): a small pad held against the belly, gripped at its
    # edges by both paws; the pencil is aimed from the writing paw at the end of the last line.
    Mn = Matrix.Translation((0.0, -0.335, 0.245)) @ Matrix.Rotation(math.radians(80), 4, "X")
    acc.add(G.transform(G.box((0.18, 0.21, 0.02), bevel_div=1.5), Mn), C["paper_shade"], "M_Toy", "notebook", part="notebook")
    acc.add(G.transform(G.box((0.17, 0.20, 0.008), center=(0, -0.002, 0.013), bevel_div=1.5), Mn), C["paper"], "M_Toy", "notebook", part="notebook")
    lines = ((0.12, 0.062), (0.11, 0.027), (0.115, -0.008), (0.06, -0.043))
    for w, y in lines:
        acc.add(G.transform(G.box((w, 0.009, 0.004), center=(-0.068 + w / 2, y, 0.0185), bevel_div=1), Mn),
                C["paper_line"], "M_Toy", "notebook", part="notebook")
    bone("notebook", Mn @ Vector((0, 0, 0)), Mn @ Vector((0, 0.12, 0)), "body", up=(0, -1, 0))

    from capy_pose import eul
    from capy_anim import FOCUSED_ARM_R, FOCUSED_ARM_R_LOC
    arm = BONES["arm.R"]
    sh = arm["head"]
    paw_rest = sh + (arm["tail"] - arm["head"]).normalized() * 0.18
    W = eul(*FOCUSED_ARM_R).to_matrix()
    loc = Vector(FOCUSED_ARM_R_LOC)
    paw_w = sh + W @ (paw_rest - sh) + loc
    n_w = (Mn.to_3x3() @ Vector((0, 0, 1))).normalized()
    grip_w = paw_w + n_w * 0.05                      # pencil passes through the front of the paw
    tip_w = Mn @ Vector((-0.068 + 0.06 + 0.004, -0.043, 0.0245))
    L = (tip_w - grip_w).length
    eraser_w = (grip_w - tip_w).normalized()
    Wi = W.inverted()
    grip = sh + Wi @ (grip_w - loc - sh)
    eraser = Wi @ eraser_w
    Mp = Matrix.Translation(grip) @ oriented(eraser, Wi @ n_w) @ Matrix.Rotation(math.radians(-90), 4, "X")
    E, r = 0.105, 0.017
    body_len = L - 0.042 + E - 0.04
    pencil = [
        (G.cylinder(r, body_len, segs=6), "pencil", -(L - 0.042)),
        (G.cylinder(r + 0.0012, 0.02, segs=12), "ferrule", E - 0.04),
        (G.cylinder(r, 0.02, segs=12), "eraser", E - 0.02),
    ]
    for bm, cname, z0 in pencil:
        acc.add(G.transform(bm, Mp @ Matrix.Translation((0, 0, z0))), C[cname], "M_Toy", "pencil", part="pencil")
    flip = Matrix.Rotation(math.pi, 4, "X")
    acc.add(G.transform(G.cylinder(r, 0.032, segs=6, top_radius=0.0065), Mp @ Matrix.Translation((0, 0, -(L - 0.042))) @ flip),
            C["wood"], "M_Toy", "pencil", part="pencil")
    acc.add(G.transform(G.cylinder(0.0065, 0.010, segs=6, top_radius=0.0), Mp @ Matrix.Translation((0, 0, -(L - 0.010))) @ flip),
            C["lead"], "M_Toy", "pencil", part="pencil")
    bone("pencil", grip, grip + eraser * 0.08, "arm.R", up=(0, -1, 0))

    # ---- floating FX (children of root) ----
    spark_spots = [((0.55, -0.15, 0.95), 0.075), ((0.43, -0.22, 1.27), 0.055), ((-0.50, -0.18, 1.18), 0.068),
                   ((-0.58, -0.12, 0.80), 0.048), ((0.05, -0.28, 1.36), 0.05)]
    for i, (pos, size) in enumerate(spark_spots):
        bm = G.transform(G.puffy(G.sparkle_outline(24), 0.18, rings=2, power=0.7), Matrix.Translation(pos) @ Matrix.Scale(size, 4))
        acc.add(bm, C["spark"], "M_Gloss", f"spark{i + 1}", part="sparkles")
        bone(f"spark{i + 1}", pos, Vector(pos) + Vector((0, 0, 0.05)), "root", up=(0, -1, 0))

    for i, pos in enumerate(((0.42, -0.20, 1.02), (-0.40, -0.18, 1.10), (0.12, -0.25, 1.22))):
        bm = G.transform(G.puffy(G.heart_outline(28), 0.35, rings=2, power=0.6), Matrix.Translation(pos) @ Matrix.Scale(0.06, 4))
        acc.add(bm, C["heart"], "M_Gloss", f"heart{i + 1}", part="hearts")
        bone(f"heart{i + 1}", pos, Vector(pos) + Vector((0, 0, 0.05)), "root", up=(0, -1, 0))

    cc = Vector((0.0, -0.04, 1.36))
    blobs = [((0, 0, 0.02), (0.15, 0.12, 0.11)), ((-0.15, 0.0, -0.02), (0.11, 0.10, 0.085)), ((0.16, 0.0, -0.015), (0.12, 0.10, 0.09)),
             ((-0.06, -0.02, -0.05), (0.13, 0.11, 0.08)), ((0.07, -0.02, -0.05), (0.13, 0.11, 0.08))]
    for off, radii in blobs:
        acc.add(G.ellipsoid(5, radii, cc + Vector(off)), C["cloud"], "M_Toy", "cloud", part="cloud")
    bone("cloud", cc, cc + Vector((0, 0, 0.1)), "root", up=(0, -1, 0))
    for i, x in enumerate((-0.13, 0.02, 0.15)):
        pos = cc + Vector((x, -0.02, -0.16))
        bm = G.transform(G.puffy([(px * 0.62, py) for (px, py) in G.drop_outline(24)], 0.55), Matrix.Translation(pos) @ Matrix.Scale(0.034, 4))
        acc.add(bm, C["drop"], "M_Gloss", f"drop{i + 1}", part="cloud")
        bone(f"drop{i + 1}", pos, pos + Vector((0, 0, 0.04)), "root", up=(0, -1, 0))

    for i, (pos, size) in enumerate((((0.48, -0.12, 1.10), 0.065), ((-0.46, -0.10, 0.96), 0.05))):
        p = Vector(pos)
        arms = []
        for k in range(6):
            a = math.radians(90 + 60 * k)
            d = Vector((math.cos(a), 0, math.sin(a)))
            arms.append(G.tube([p, p + d * size], size * 0.11, segs=5, caps=False))
            q = p + d * size * 0.58
            for side in (-1, 1):
                b2 = Vector((math.cos(a + side * 0.75), 0, math.sin(a + side * 0.75)))
                arms.append(G.tube([q, q + b2 * size * 0.32], size * 0.08, segs=4, caps=False))
        acc.add(G.merge(*arms), C["snow"], "M_Gloss", f"snow{i + 1}", part="snow")
        bone(f"snow{i + 1}", p, p + Vector((0, 0, 0.05)), "root", up=(0, -1, 0))

    pe = Vector((0.34, -0.14, 1.20))
    bar = G.tube([pe + Vector((0, 0, 0.075)), pe + Vector((-0.004, 0, -0.005))], 0.022, segs=8)
    dot = G.ellipsoid(6, (0.022, 0.022, 0.022), pe + Vector((-0.006, 0, -0.05)))
    acc.add(G.transform(G.merge(bar, dot), Matrix.Translation(pe) @ Matrix.Rotation(math.radians(-14), 4, "Y") @ Matrix.Translation(-pe)),
            C["exclaim"], "M_Gloss", "exclaim", part="exclaim")
    bone("exclaim", pe + Vector((0, 0, -0.06)), pe + Vector((0, 0, 0.06)), "root", up=(0, -1, 0))

    # question mark (confused): beside the viewer-left side of the head, follows head tilts
    pq = Vector((-0.40, -0.12, 1.10))
    R, cz = 0.036, 0.036
    pts = [Vector((R * math.cos(math.radians(a)), 0, cz + R * math.sin(math.radians(a))))
           for a in [160 - k * 15 for k in range(15)]]                       # 160 deg -> -50 deg, clockwise
    pts += [Vector((0.012, 0, 0.0)), Vector((0.003, 0, -0.010)), Vector((0.0, 0, -0.020)), Vector((0.0, 0, -0.030))]
    hook = G.tube(pts, 0.016, segs=8)
    dot = G.ellipsoid(6, (0.019, 0.019, 0.019), (0, 0, -0.066))
    acc.add(G.transform(G.merge(hook, dot), Matrix.Translation(pq) @ Matrix.Rotation(math.radians(-12), 4, "Y")),
            C["question"], "M_Gloss", "question", part="question")
    bone("question", pq + Vector((0, 0, -0.06)), pq + Vector((0, 0, 0.06)), "head", up=(0, -1, 0))

    # watering can (world activities): the grip on its handle sits in the right paw
    paw = BONES["arm.R"]["tail"]
    for bm, cname, mat in can_parts(paw):
        acc.add(bm, C[cname], mat, "can", part="can")
    bone("can", paw, paw + Vector((0, 0, -0.10)), "arm.R", up=(0, -1, 0))


def can_parts(grip):
    """Watering-can pieces [(bmesh, colour, material)] with can-bone space (capy_pose.CAN) placed at `grip`.
    Body, handle and spout reuse the scarf blue, the trims the scarf white, the rose the crown gold."""
    from capy_pose import CAN, CAN_BOTTOM, CAN_HANDLE_Y, SPOUT_BASE, SPOUT_DIR, SPOUT_TIP
    r, h = CAN["r"], CAN["h"]
    grip = Vector(grip)
    base = Matrix.Translation(grip + CAN_BOTTOM)
    prof = [(0, 0), (r * 0.80, 0), (r * 0.94, 0.004), (r, 0.016), (r, h - 0.016), (r * 0.95, h - 0.006),
            (r * 0.80, h - 0.001), (r * 0.45, h + 0.002), (0, h + 0.003)]
    parts = [(G.transform(G.lathe(prof, segs=24), base), "scarf_a", "M_Gloss")]
    band = G.torus_segment(r + 0.0008, 0.0062, 0.0, math.tau, segs=24, rsegs=6)
    parts.append((G.transform(band, base @ Matrix.Translation((0, 0, h * 0.40))), "scarf_b", "M_Toy"))
    rim = G.torus_segment(r * 0.80, 0.0060, 0.0, math.tau, segs=24, rsegs=6)
    parts.append((G.transform(rim, base @ Matrix.Translation((0, 0, h - 0.002))), "scarf_b", "M_Toy"))
    spout = G.cylinder(CAN["spout_r"][0], CAN["spout_len"], segs=10, top_radius=CAN["spout_r"][1])
    parts.append((G.transform(spout, Matrix.Translation(grip + SPOUT_BASE) @ aim_z(SPOUT_DIR)), "scarf_a", "M_Gloss"))
    rose = G.cylinder(CAN["rose_r"][0], CAN["rose_len"], segs=14, top_radius=CAN["rose_r"][1])
    parts.append((G.transform(rose, Matrix.Translation(grip + SPOUT_TIP - SPOUT_DIR * 0.004) @ aim_z(SPOUT_DIR)),
                  "gold", "M_Gold"))
    pts = []
    for k in range(15):                      # D handle on the back, from near the top rim to the lower back
        a = math.radians(100 - 195 * k / 14)
        pts.append(base @ Vector((0.0, CAN_HANDLE_Y + CAN["handle_ry"] * math.cos(a),
                                  CAN["handle_cz"] + CAN["handle_rz"] * math.sin(a))))
    parts.append((G.tube(pts, CAN["handle_r"], segs=8, plane_normal=Vector((1, 0, 0))), "scarf_a", "M_Gloss"))
    return parts


def build_static_can(coll):
    """`WateringCan`: an unskinned copy of the can that the app lifts out of each Capy and places in the world.
    The node is an identity-transform empty with its origin at the can's bottom centre; the mesh hangs under
    it, so mesh quantization (gltf-transform meshopt) parks its dequantization transform on the child."""
    from capy_pose import CAN_BOTTOM
    acc = G.Accumulator()
    for bm, cname, mat in can_parts(-CAN_BOTTOM):
        acc.add(bm, C[cname], mat, "WateringCan", part="can")
    acc.bm.verts.layers.deform.remove(acc.dl)      # no bone weights: never skinned
    me = bpy.data.meshes.new("WateringCanMesh")
    acc.bm.to_mesh(me)
    acc.bm.free()
    for name in acc.materials:
        me.materials.append(bpy.data.materials[name])
    holder = bpy.data.objects.new("WateringCan", None)
    holder.empty_display_size = 0.1
    ob = bpy.data.objects.new("WateringCanMesh", me)
    ob.parent = holder
    for o in (holder, ob):
        coll.objects.link(o)
        o.hide_render = True    # parked at the origin, inside Capy: only the app shows it
    return ob


# ============================================================================ materials
def blush_texture(path):
    size = 64
    img = bpy.data.images.new("T_Capy_Blush", size, size, alpha=True)
    px = []
    r0, g0, b0 = (int(PAL["blush"][i:i + 2], 16) / 255 for i in (1, 3, 5))
    for j in range(size):
        for i in range(size):
            x = (i + 0.5) / size * 2 - 1
            y = (j + 0.5) / size * 2 - 1
            d = math.sqrt(x * x + y * y)
            t = max(0.0, min(1.0, (1.0 - d) / 0.75))
            a = (t * t * (3 - 2 * t)) * 0.92
            px += [r0, g0, b0, a]
    img.pixels.foreach_set(px)
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.source = "FILE"
    img.filepath = path
    img.reload()
    return img


def make_materials(names, tex_dir):
    mats = []
    for name in names:
        m = bpy.data.materials.new(name)
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Roughness"].default_value = 0.6
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
        if name in ("M_Toy", "M_Gloss", "M_Glass", "M_Eye"):
            vc = nt.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = "Col"
            vc.location = (-400, 200)
            nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        if name == "M_Gloss":
            bsdf.inputs["Roughness"].default_value = 0.22
            bsdf.inputs["Specular IOR Level"].default_value = 0.5
        if name == "M_Eye":
            bsdf.inputs["Roughness"].default_value = 0.42
            bsdf.inputs["Specular IOR Level"].default_value = 0.28
        if name == "M_Gold":
            bsdf.inputs["Base Color"].default_value = C["gold"]
            # half-metal: reads as gold both in Blender and in the app's IBL-free three.js lighting
            bsdf.inputs["Metallic"].default_value = 0.5
            bsdf.inputs["Roughness"].default_value = 0.32
        if name == "M_Glass":
            bsdf.inputs["Alpha"].default_value = 0.45
            bsdf.inputs["Roughness"].default_value = 0.05
            m.surface_render_method = "BLENDED"
        if name == "M_Blush":
            img = blush_texture(os.path.join(tex_dir, "T_Capy_Blush.png"))
            tex = nt.nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.location = (-400, 200)
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            bsdf.inputs["Roughness"].default_value = 0.85
            m.surface_render_method = "BLENDED"
        if name in ("M_Glass", "M_Blush"):
            m.use_backface_culling = True
        mats.append(m)
    return mats


# ============================================================================ rig
def build_rig(coll):
    arm = bpy.data.armatures.new("RIG_Capy")
    ob = bpy.data.objects.new("RIG_Capy", arm)
    coll.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for name, b in BONES.items():
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = b["head"], b["tail"]
        if b["up"] is not None:
            eb.align_roll(b["up"])
        eb.use_deform = True
        eb.use_connect = False
        created[name] = eb
    for name, b in BONES.items():
        if b["parent"]:
            created[name].parent = created[b["parent"]]
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.display_type = "STICK"
    for pb in ob.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return ob


def build(out_path):
    bpy.ops.wm.read_homefile(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    coll = bpy.data.collections.new("Capy")
    scene.collection.children.link(coll)

    acc = G.Accumulator()
    surf_head, surf_muzzle = build_body(acc)
    eye_frames = build_face(acc, surf_head, surf_muzzle)
    build_props(acc, surf_head, eye_frames)

    me = bpy.data.meshes.new("SK_Capy")
    acc.bm.to_mesh(me)
    acc.bm.free()
    ob = bpy.data.objects.new("SK_Capy", me)
    coll.objects.link(ob)
    for gname in acc.groups:
        ob.vertex_groups.new(name=gname)
    tex_dir = os.path.join(HERE, "textures")
    os.makedirs(tex_dir, exist_ok=True)
    for m in make_materials(acc.materials, tex_dir):
        me.materials.append(m)

    rig = build_rig(coll)
    ob.parent = rig
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig

    missing = [g for g in acc.groups if g not in BONES]
    if missing:
        raise RuntimeError(f"vertex groups without bones: {missing}")
    can = build_static_can(coll)
    stats = {"verts": len(me.vertices), "faces": len(me.polygons),
             "tris": sum(len(p.vertices) - 2 for p in me.polygons), "bones": len(BONES),
             "materials": acc.materials, "parts": acc.parts,
             "static_can_tris": sum(len(p.vertices) - 2 for p in can.data.polygons)}
    if out_path:
        bpy.context.preferences.filepaths.save_version = 0   # no .blend1 backup
        bpy.ops.wm.save_as_mainfile(filepath=out_path)
    return stats


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = None
    if "--out" in argv:
        out = os.path.abspath(argv[argv.index("--out") + 1])
    import json
    print("@@JSON@@" + json.dumps(build(out)))
