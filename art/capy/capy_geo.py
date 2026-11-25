"""Geometry helpers for the Capy mascot (Blender 5.3, bmesh only, no operators).

Every part is generated procedurally so the character can be rebuilt from source:
quad spheres shaped by analytic functions, surface-conforming decals for facial
features, puffy symbol shapes and swept tubes for stroke props.
"""
import math

import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

TAU = math.tau


# --------------------------------------------------------------------------- colour
def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def col(hex_str, alpha=1.0):
    """sRGB hex -> linear RGBA (Blender colour attributes are scene linear)."""
    h = hex_str.lstrip("#")
    return (_lin(int(h[0:2], 16) / 255), _lin(int(h[2:4], 16) / 255), _lin(int(h[4:6], 16) / 255), alpha)


# --------------------------------------------------------------------------- accumulator
class Accumulator:
    """Collects every part into ONE bmesh with colour, material, UV and bone weights."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new("Col")
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.dl = self.bm.verts.layers.deform.verify()
        self.groups = []
        self.materials = []
        self.parts = {}

    def _index(self, seq, name):
        if name not in seq:
            seq.append(name)
        return seq.index(name)

    def add(self, src, color, material, group, matrix=None, uv=None, part=None):
        """Append bmesh `src`. `uv`: callable(local_co, src_vert) -> (u, v) or None."""
        g = self._index(self.groups, group)
        m = self._index(self.materials, material)
        src_uv = src.loops.layers.uv.active
        vmap = {}
        for v in src.verts:
            nv = self.bm.verts.new(matrix @ v.co if matrix else v.co.copy())
            nv[self.col] = color
            nv[self.dl][g] = 1.0
            vmap[v] = nv
        for f in src.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = m
            nf.smooth = f.smooth
            for lo_src, lo_dst in zip(f.loops, nf.loops):
                if src_uv is not None:
                    lo_dst[self.uv].uv = lo_src[src_uv].uv
                elif uv is not None:
                    lo_dst[self.uv].uv = uv(lo_src.vert.co)
        for e in src.edges:
            if not e.smooth:
                ne = self.bm.edges.get((vmap[e.verts[0]], vmap[e.verts[1]]))
                if ne:
                    ne.smooth = False
        if part:
            self.parts.setdefault(part, 0)
            self.parts[part] += len(src.faces)
        src.free()


# --------------------------------------------------------------------------- base shapes
def quad_sphere(div):
    """Equal-angle spherified cube: even quads, no poles."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=div - 1, use_grid_fill=True)
    for v in bm.verts:
        v.co = Vector(tuple(math.tan(c * math.pi / 4) for c in v.co)).normalized()
    for f in bm.faces:
        f.smooth = True
    return bm


def shaped(div, fn, matrix=None):
    bm = quad_sphere(div)
    for v in bm.verts:
        p = fn(v.co.copy())
        v.co = matrix @ p if matrix else p
    bm.normal_update()
    return bm


def superdir(d, e):
    """Scale unit direction d onto the unit superellipsoid |x|^e+|y|^e+|z|^e=1."""
    s = (abs(d.x) ** e + abs(d.y) ** e + abs(d.z) ** e) ** (-1.0 / e)
    return d * s


def ellipsoid(div, radii, center=(0, 0, 0), e=2.0, matrix=None):
    rx, ry, rz = radii
    c = Vector(center)

    def fn(d):
        q = superdir(d, e) if e != 2.0 else d
        return c + Vector((q.x * rx, q.y * ry, q.z * rz))

    return shaped(div, fn, matrix)


def bump(p, center, at, amp, sigma):
    w = math.exp(-(p - at).length_squared / (2 * sigma * sigma))
    return p + (p - center).normalized() * amp * w


def softfloor(z, z0, k):
    x = (z - z0) / k
    return z0 + k * (math.log1p(math.exp(x)) if x < 30 else x)


def capsule(radius, length, segs=16, rings=6):
    """Capsule along +Y starting at origin."""
    bm = bmesh.new()
    rows = []
    for i in range(rings + 1):  # bottom hemisphere
        a = -math.pi / 2 + (math.pi / 2) * i / rings
        rows.append((radius * math.sin(a), radius * math.cos(a)))
    for i in range(rings + 1):  # top hemisphere
        a = (math.pi / 2) * i / rings
        rows.append((length + radius * math.sin(a), radius * math.cos(a)))
    rows[0] = (rows[0][0], 0.0)
    rows[-1] = (rows[-1][0], 0.0)
    rings_v = []
    for y, r in rows:
        if r < 1e-6:
            rings_v.append([bm.verts.new((0, y + radius, 0))])
        else:
            rings_v.append([bm.verts.new((r * math.cos(TAU * j / segs), y + radius, r * math.sin(TAU * j / segs)))
                            for j in range(segs)])
    for a, b in zip(rings_v[:-1], rings_v[1:]):
        if len(a) == 1:
            for j in range(segs):
                bm.faces.new((a[0], b[(j + 1) % segs], b[j]))
        elif len(b) == 1:
            for j in range(segs):
                bm.faces.new((a[j], a[(j + 1) % segs], b[0]))
        else:
            for j in range(segs):
                bm.faces.new((a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]))
    _finish(bm)
    return bm


def cylinder(radius, depth, segs=24, top_radius=None, cap=True):
    """Cylinder/cone along +Z from z=0 to z=depth."""
    tr = radius if top_radius is None else top_radius
    bm = bmesh.new()
    lo = [bm.verts.new((radius * math.cos(TAU * j / segs), radius * math.sin(TAU * j / segs), 0)) for j in range(segs)]
    if tr > 1e-6:
        hi = [bm.verts.new((tr * math.cos(TAU * j / segs), tr * math.sin(TAU * j / segs), depth)) for j in range(segs)]
        for j in range(segs):
            bm.faces.new((lo[j], lo[(j + 1) % segs], hi[(j + 1) % segs], hi[j]))
        if cap:
            bm.faces.new(hi)
    else:
        tip = bm.verts.new((0, 0, depth))
        for j in range(segs):
            bm.faces.new((lo[j], lo[(j + 1) % segs], tip))
    if cap:
        bm.faces.new(list(reversed(lo)))
    _finish(bm, sharp_angle=50)
    return bm


def torus_segment(R, r, a0, a1, segs=8, rsegs=12, rx_scale=1.0, ry_scale=1.0):
    """Partial torus around Z (angles in radians), tube radius r. Open ends."""
    bm = bmesh.new()
    rings = []
    for i in range(segs + 1):
        a = a0 + (a1 - a0) * i / segs
        cx, cy = R * math.cos(a) * rx_scale, R * math.sin(a) * ry_scale
        out = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for j in range(rsegs):
            b = TAU * j / rsegs
            p = Vector((cx, cy, 0)) + out * (r * math.cos(b)) + Vector((0, 0, r * math.sin(b)))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for ra, rb in zip(rings[:-1], rings[1:]):
        for j in range(rsegs):
            bm.faces.new((ra[j], rb[j], rb[(j + 1) % rsegs], ra[(j + 1) % rsegs]))
    _finish(bm)
    return bm


def box(size, center=(0, 0, 0), bevel_div=2):
    """Rounded box via superellipsoid quad sphere (bevel_div 1 = plain 6-face cube)."""
    if bevel_div <= 1:
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(center)
        _finish(bm, sharp_angle=40)
        return bm
    return ellipsoid(int(bevel_div * 4), (size[0] / 2, size[1] / 2, size[2] / 2), center, e=6.0)


def _finish(bm, sharp_angle=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = True
    if sharp_angle is not None:
        lim = math.radians(sharp_angle)
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
                e.smooth = False
    bm.normal_update()


def transform(bm, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
    bm.normal_update()
    return bm


def frame_matrix(origin, x_axis, y_axis, z_axis):
    m = Matrix.Identity(4)
    for i in range(3):
        m[i][0], m[i][1], m[i][2] = x_axis[i], y_axis[i], z_axis[i]
        m[i][3] = origin[i]
    return m


# --------------------------------------------------------------------------- 2D shapes
def polar_from_outline(outline, center=(0.0, 0.0), rings=3):
    """Star-shaped outline (CCW list of (x, y)) -> grid with interior rings."""
    cx, cy = center
    segs = len(outline)
    verts, rho = [(cx, cy)], [0.0]
    for k in range(1, rings + 1):
        f = k / rings
        for (x, y) in outline:
            verts.append((cx + (x - cx) * f, cy + (y - cy) * f))
            rho.append(f)
    faces = [(0, 1 + j, 1 + (j + 1) % segs) for j in range(segs)]
    for k in range(1, rings):
        b0, b1 = 1 + (k - 1) * segs, 1 + k * segs
        for j in range(segs):
            j2 = (j + 1) % segs
            faces.append((b0 + j, b1 + j, b1 + j2, b0 + j2))
    boundary = [1 + (rings - 1) * segs + j for j in range(segs)]
    return verts, faces, boundary, rho


def ray_ellipse(cx, cy, a, rx, ry, ex=0.0, ey=0.0):
    dx, dy = math.cos(a), math.sin(a)
    ox, oy = (cx - ex) / rx, (cy - ey) / ry
    vx, vy = dx / rx, dy / ry
    A = vx * vx + vy * vy
    B = 2 * (ox * vx + oy * vy)
    C = ox * ox + oy * oy - 1
    return (-B + math.sqrt(max(B * B - 4 * A * C, 0.0))) / (2 * A)


def ray_halfplane(cx, cy, a, y0, k):
    """Distance along ray to the line y = y0 + k*x (region below the line is kept)."""
    dx, dy = math.cos(a), math.sin(a)
    den = dy - k * dx
    if den <= 1e-9:
        return 1e9
    t = (y0 + k * cx - cy) / den
    return t if t > 0 else 1e9


def ellipse_outline(rx, ry, center=(0.0, 0.0), segs=40, ex=0.0, ey=0.0, cuts=()):
    """Ellipse (centred ex, ey) seen from `center`, optionally clipped by half planes (y0, k)."""
    cx, cy = center
    out = []
    for j in range(segs):
        a = TAU * j / segs
        t = ray_ellipse(cx, cy, a, rx, ry, ex, ey)
        for (y0, k) in cuts:
            t = min(t, ray_halfplane(cx, cy, a, y0, k))
        out.append((cx + math.cos(a) * t, cy + math.sin(a) * t))
    return out


def heart_outline(segs=48):
    pts = []
    for j in range(segs):
        t = TAU * j / segs
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17.0, y / 17.0 + 0.1))
    # parametric heart runs clockwise; make CCW
    pts.reverse()
    return pts


def drop_outline(segs=40, width=0.62):
    pts = []
    for j in range(segs):
        t = TAU * j / segs
        x = math.sin(t) * (1 - math.cos(t)) ** 0.7 * width
        y = math.cos(t)
        pts.append((x, y))
    pts.reverse()
    if _signed_area(pts) < 0:
        pts.reverse()
    return pts


def sparkle_outline(segs=48, q=0.55):
    pts = []
    for j in range(segs):
        a = TAU * j / segs
        r = (abs(math.cos(a)) ** q + abs(math.sin(a)) ** q) ** (-1.0 / q)
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return pts


def _signed_area(pts):
    return 0.5 * sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                     for i in range(len(pts)))


def stroke(points, width, cap_segs=6, taper=None):
    """Flat 2D stroke with round caps -> (verts, faces, boundary, rho)."""
    n = len(points)
    P = [Vector(p) for p in points]
    tans = []
    for i in range(n):
        a, b = P[max(i - 1, 0)], P[min(i + 1, n - 1)]
        tans.append((b - a).normalized())
    verts, L, C, R = [], [], [], []
    for i in range(n):
        w = width * (taper(i / (n - 1)) if taper else 1.0) / 2
        nr = Vector((-tans[i].y, tans[i].x))
        L.append(len(verts)); verts.append(tuple(P[i] + nr * w))
        C.append(len(verts)); verts.append(tuple(P[i]))
        R.append(len(verts)); verts.append(tuple(P[i] - nr * w))
    faces = []
    for i in range(n - 1):
        faces.append((L[i], C[i], C[i + 1], L[i + 1]))
        faces.append((C[i], R[i], R[i + 1], C[i + 1]))

    def cap(i, start):
        w = width * (taper(i / (n - 1)) if taper else 1.0) / 2
        nr = Vector((-tans[i].y, tans[i].x))
        base = math.atan2(-nr.y, -nr.x) if start else math.atan2(nr.y, nr.x)
        arc = [R[i]] if start else [L[i]]
        for k in range(1, cap_segs):
            a = base - math.pi * k / cap_segs
            arc.append(len(verts)); verts.append((P[i].x + math.cos(a) * w, P[i].y + math.sin(a) * w))
        arc.append(L[i] if start else R[i])
        for k in range(cap_segs):
            faces.append((C[i], arc[k + 1], arc[k]))
        return arc[1:-1]

    end_arc = cap(n - 1, False)
    start_arc = cap(0, True)
    boundary = L + end_arc + list(reversed(R)) + start_arc
    if _signed_area([verts[i] for i in boundary]) < 0:
        boundary.reverse()
    rho = [0.0] * len(verts)
    return verts, faces, boundary, rho


def mirror2d(shape):
    verts, faces, boundary, rho = shape
    return ([(-x, y) for (x, y) in verts], [tuple(reversed(f)) for f in faces], list(reversed(boundary)), rho)


def xform2d(shape, sx=1.0, sy=1.0, rot=0.0, dx=0.0, dy=0.0):
    verts, faces, boundary, rho = shape
    c, s = math.cos(rot), math.sin(rot)
    out = []
    for (x, y) in verts:
        x, y = x * sx, y * sy
        out.append((x * c - y * s + dx, x * s + y * c + dy))
    if sx * sy < 0:
        faces = [tuple(reversed(f)) for f in faces]
        boundary = list(reversed(boundary))
    return out, faces, boundary, rho


# --------------------------------------------------------------------------- surfaces & decals
class Surface:
    def __init__(self, bm):
        self.bvh = BVHTree.FromBMesh(bm)

    def hit(self, point, direction, back=0.3):
        d = direction.normalized()
        loc, nor, _, _ = self.bvh.ray_cast(point - d * back, d, back * 2.5)
        if loc is None:
            loc, nor, _, _ = self.bvh.find_nearest(point)
        return loc, nor

    def anchor(self, center, direction, up=Vector((0, 0, 1)), spin=0.0):
        """Surface point hit from `center` along `direction` + smoothed normal frame."""
        d = Vector(direction).normalized()
        far = Vector(center) + d * 2.0
        loc, _, _, _ = self.bvh.ray_cast(far, -d, 4.0)
        if loc is None:
            raise RuntimeError("anchor ray missed the surface")
        # smoothed normal: average face normals of a small neighbourhood
        acc = Vector()
        for dx in (-0.012, 0.0, 0.012):
            for dz in (-0.012, 0.0, 0.012):
                q = loc + Vector((dx, 0, dz))
                _, nor, _, _ = self.bvh.find_nearest(q)
                if nor is not None:
                    acc += nor
        n = acc.normalized()
        if n.dot(d) < 0:
            n = -n
        u = (Vector(up) - n * Vector(up).dot(n)).normalized()
        if spin:
            from mathutils import Quaternion
            u = Quaternion(n, spin) @ u
        return loc, n, u


def decal(surface, P0, n, u, shape, scale, offset=0.002, skirt=0.003, dome=0.0, offset_fn=None, uv_scale=None):
    """Project a 2D shape onto `surface` and return a bmesh (top face + skirt into the surface).

    The decal frame: r = u x n is the viewer's right, u is up, n points out of the surface.
    """
    verts2d, faces, boundary, rho = shape
    r = u.cross(n)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap") if uv_scale else None
    top, offs = [], []
    for i, (x, y) in enumerate(verts2d):
        p = P0 + r * (x * scale) + u * (y * scale)
        loc, _ = surface.hit(p, -n)
        o = offset_fn(x, y) if offset_fn else offset + dome * (1 - rho[i] ** 2)
        offs.append(o)
        top.append(bm.verts.new(loc + n * o))
    for f in faces:
        try:
            nf = bm.faces.new([top[i] for i in f])
        except ValueError:
            continue
        nf.smooth = True
        if uv_layer:
            for lo, i in zip(nf.loops, f):
                x, y = verts2d[i]
                lo[uv_layer].uv = (0.5 + x / uv_scale[0] * 0.5, 0.5 + y / uv_scale[1] * 0.5)
    if skirt > 0:
        bot = {}
        for i in boundary:
            bot[i] = bm.verts.new(top[i].co - n * (offs[i] + skirt))
        nb = len(boundary)
        for k in range(nb):
            i, j = boundary[k], boundary[(k + 1) % nb]
            try:
                f = bm.faces.new((top[i], bot[i], bot[j], top[j]))
                f.smooth = False
            except ValueError:
                pass
            e = bm.edges.get((top[i], top[j]))
            if e:
                e.smooth = False
    bm.normal_update()
    return bm


# --------------------------------------------------------------------------- puffy symbols & tubes
def puffy(outline, thickness, center=(0.0, 0.0), rings=4, power=0.6):
    """Closed pillow from a star-shaped 2D outline in the XZ plane, facing -Y (Blender front)."""
    verts2d, faces, boundary, rho = polar_from_outline(outline, center, rings)
    bm = bmesh.new()
    nb = len(boundary)
    ring_start = len(verts2d) - nb
    front, back = [], []
    for i, (x, y) in enumerate(verts2d):
        h = thickness * max(0.0, 1 - rho[i] ** 2) ** power
        front.append(bm.verts.new((x, -h, y)))
    for i, (x, y) in enumerate(verts2d):
        if i >= ring_start:
            back.append(front[i])
        else:
            h = thickness * max(0.0, 1 - rho[i] ** 2) ** power
            back.append(bm.verts.new((x, h, y)))
    for f in faces:
        # 2D CCW in (x, y) maps to x->X, y->Z; viewed from -Y this stays CCW, so the normal is -Y.
        bm.faces.new([front[i] for i in f])
        bm.faces.new([back[i] for i in reversed(f)])
    _finish(bm)
    return bm


def tube(points, radius, segs=10, plane_normal=Vector((0, -1, 0)), caps=True):
    """Sweep a circle along a 3D polyline; round caps."""
    P = [Vector(p) for p in points]
    n = len(P)
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a, b = P[max(i - 1, 0)], P[min(i + 1, n - 1)]
        t = (b - a).normalized()
        nn = plane_normal - t * plane_normal.dot(t)
        if nn.length < 1e-6:
            nn = t.orthogonal()
        nn.normalize()
        bn = t.cross(nn)
        ring = [bm.verts.new(P[i] + (nn * math.cos(TAU * j / segs) + bn * math.sin(TAU * j / segs)) * radius)
                for j in range(segs)]
        rings.append((ring, t, nn, bn))
    for (ra, _, _, _), (rb, _, _, _) in zip(rings[:-1], rings[1:]):
        for j in range(segs):
            bm.faces.new((ra[j], ra[(j + 1) % segs], rb[(j + 1) % segs], rb[j]))
    if caps:
        for idx, sign in ((0, -1), (n - 1, 1)):
            ring, t, nn, bn = rings[idx]
            prev = ring
            steps = 3
            for k in range(1, steps + 1):
                ang = (math.pi / 2) * k / steps
                if k == steps:
                    tip = bm.verts.new(P[idx] + t * sign * radius)
                    for j in range(segs):
                        if sign > 0:
                            bm.faces.new((prev[j], prev[(j + 1) % segs], tip))
                        else:
                            bm.faces.new((prev[(j + 1) % segs], prev[j], tip))
                else:
                    cur = [bm.verts.new(P[idx] + t * sign * radius * math.sin(ang) +
                                        (nn * math.cos(TAU * j / segs) + bn * math.sin(TAU * j / segs)) * radius * math.cos(ang))
                           for j in range(segs)]
                    for j in range(segs):
                        if sign > 0:
                            bm.faces.new((prev[j], prev[(j + 1) % segs], cur[(j + 1) % segs], cur[j]))
                        else:
                            bm.faces.new((prev[(j + 1) % segs], prev[j], cur[j], cur[(j + 1) % segs]))
                    prev = cur
    _finish(bm)
    return bm


def merge(*bms):
    out = bmesh.new()
    for b in bms:
        vmap = {}
        for v in b.verts:
            vmap[v] = out.verts.new(v.co)
        for f in b.faces:
            nf = out.faces.new([vmap[v] for v in f.verts])
            nf.smooth = f.smooth
        for e in b.edges:
            if not e.smooth:
                ne = out.edges.get((vmap[e.verts[0]], vmap[e.verts[1]]))
                if ne:
                    ne.smooth = False
        b.free()
    out.normal_update()
    return out
