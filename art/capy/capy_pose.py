"""Pose layer for Capy: high-level expression controls -> pose-bone transforms.

Rotations and translations are authored in the armature's rest axes (world-like:
+X character left, -Y front, +Z up) and converted to each bone's local basis, so
animation code never depends on individual bone rolls.
"""
import math

from mathutils import Matrix, Quaternion, Vector

EYE_VARIANTS = ("open", "happy", "closed", "squint", "sad", "angry", "sleepy", "star", "wide")
MOUTH_VARIANTS = ("smile", "open", "frown", "o", "wavy", "grr", "tongue", "smirk")
PROPS = ("beret", "crown", "yuzu", "scarf", "scarf_tail", "tear.L", "tear.R", "sweat", "anger", "puff.L", "puff.R",
         "z1", "z2", "z3", "bubble", "notebook", "pencil", "spark1", "spark2", "spark3", "spark4", "spark5",
         "heart1", "heart2", "heart3", "cloud", "drop1", "drop2", "drop3", "snow1", "snow2", "exclaim", "question")
SIDES = (("L", 1.0), ("R", -1.0))


def eul(x=0.0, y=0.0, z=0.0):
    """Armature-space rotation from degrees, applied X (nod) then Y (roll) then Z (turn)."""
    qx = Quaternion((1, 0, 0), math.radians(x))
    qy = Quaternion((0, 1, 0), math.radians(y))
    qz = Quaternion((0, 0, 1), math.radians(z))
    return qz @ qy @ qx


def default_controls():
    return dict(
        root_loc=(0, 0, 0), root_rot=(0, 0, 0),
        body_rot=(0, 0, 0), torso_scale=(1, 1, 1),
        head_loc=(0, 0, 0), head_rot=(0, 0, 0),
        ear_L=(0, 0, 0), ear_R=(0, 0, 0),
        arm_L=(0, 0, 0), arm_R=(0, 0, 0), arm_L_loc=(0, 0, 0), arm_R_loc=(0, 0, 0),
        foot_L=(0, 0, 0), foot_R=(0, 0, 0), foot_L_loc=(0, 0, 0), foot_R_loc=(0, 0, 0),
        eyes=("open", "open"), blink=(1.0, 1.0), look=(0.0, 0.0), eye_scale=1.0,
        brow_L=(0.0, 0.0), brow_R=(0.0, 0.0), brow_scale=1.0,
        mouth="smile", mouth_scale=1.0, mouth_loc=(0.0, 0.0),
        blush=1.0,
        props={"beret": 1.0},
    )


class CapyRig:
    def __init__(self, rig_ob):
        self.ob = rig_ob
        self.rest = {}
        self.frame = {}
        for b in rig_ob.data.bones:
            m = b.matrix_local.to_3x3()
            self.rest[b.name] = m
            # bone axes in armature space: X, Y (along bone), Z (up/roll)
            self.frame[b.name] = (m.col[0].copy(), m.col[1].copy(), m.col[2].copy())
        self.names = [b.name for b in rig_ob.data.bones]

    # ------------------------------------------------------------------ conversion
    def basis(self, name, loc_w=None, rot_w=None):
        B = self.rest[name]
        Bi = B.inverted()
        loc = Bi @ Vector(loc_w) if loc_w is not None else Vector()
        rot = (Bi @ rot_w.to_matrix() @ B).to_quaternion() if rot_w is not None else Quaternion()
        return loc, rot

    def face_axes(self, name):
        """(right, up, normal) of a face bone: normal = bone Y, up = bone Z, right = viewer right."""
        x, y, z = self.frame[name]
        return -x, z, y

    # ------------------------------------------------------------------ controls -> transforms
    def solve(self, c):
        """Return {bone: (loc_basis, quat_basis, scale_vector)} for every bone."""
        T = {}

        def put(name, loc_w=None, rot_w=None, scale=(1, 1, 1)):
            loc, rot = self.basis(name, loc_w, rot_w)
            s = Vector((scale, scale, scale)) if isinstance(scale, (int, float)) else Vector(scale)
            T[name] = (loc, rot, s)

        for name in self.names:
            T[name] = (Vector(), Quaternion(), Vector((1, 1, 1)))

        put("root", c["root_loc"], eul(*c["root_rot"]))
        put("body", None, eul(*c["body_rot"]))
        put("torso", None, None, c["torso_scale"])
        put("head", c["head_loc"], eul(*c["head_rot"]))
        for side, s in SIDES:
            put(f"ear.{side}", None, eul(*c[f"ear_{side}"]))
            put(f"arm.{side}", c[f"arm_{side}_loc"], eul(*c[f"arm_{side}"]))
            put(f"foot.{side}", c[f"foot_{side}_loc"], eul(*c[f"foot_{side}"]))

        # eyes: blink squashes along the face-up axis (bone local Z)
        eyes = c["eyes"]
        for i, (side, s) in enumerate(SIDES):
            r, u, n = self.face_axes(f"eye.{side}")
            dx, dy = c["look"]
            b = max(0.001, c["blink"][i])
            es = c["eye_scale"]
            put(f"eye.{side}", r * dx + u * dy, None, (es, es, es * b))
            for v in EYE_VARIANTS:
                put(f"eye_{v}.{side}", None, None, 1.0 if eyes[i] == v else 0.0)
            # brows: angle > 0 lifts the inner (nose-side) end; raise moves along face-up
            ang, rise = c[f"brow_{side}"]
            rb, ub, nb = self.face_axes(f"brow.{side}")
            put(f"brow.{side}", ub * rise, Quaternion(nb, math.radians(ang) * (-s)), c["brow_scale"])
            put(f"blush.{side}", None, None, c["blush"])

        rm, um, nm = self.face_axes("mouth")
        mx, my = c["mouth_loc"]
        put("mouth", rm * mx + um * my, None, c["mouth_scale"])
        for v in MOUTH_VARIANTS:
            put(f"mouth_{v}", None, None, 1.0 if c["mouth"] == v else 0.0)

        for p in PROPS:
            spec = c["props"].get(p, 0.0)
            if isinstance(spec, dict):
                rot = spec.get("rot")
                put(p, spec.get("loc"), eul(*rot) if rot is not None else None, spec.get("scale", 1.0))
            else:
                put(p, None, None, spec)
        # the scarf tail lives under the scarf; keep it visible whenever the scarf is
        if not isinstance(c["props"].get("scarf_tail"), dict) and "scarf_tail" not in c["props"]:
            T["scarf_tail"] = (Vector(), Quaternion(), Vector((1, 1, 1)))
        return T

    def apply(self, T):
        pbs = self.ob.pose.bones
        for name, (loc, rot, s) in T.items():
            pb = pbs[name]
            pb.location = loc
            pb.rotation_quaternion = rot
            pb.scale = s


def controls(**overrides):
    c = default_controls()
    for k, v in overrides.items():
        if k == "props":
            c["props"] = dict(v)
        else:
            c[k] = v
    return c
