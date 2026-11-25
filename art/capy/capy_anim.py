"""Capy clips -> one Action each: 12 emotional states and 7 world activities.

Every clip is a pure function of (t in [0, 1), frame, frame_count) that returns the
high-level controls from capy_pose. Loops use whole-number cycles, so frame 0 and the
last frame match. Each clip keys EVERY bone, so switching clips in three.js always
resets visibility toggles and props.

World activities (Walk, WalkCan, TurnStep, Water, Sniff, Wave, PickUp) are authored in
place: the app moves and turns Capy, the clip moves the body. Walk and TurnStep roll each
stance foot over ground that moves at exactly the app's pace, so planted feet never slide.
"""
import math

from mathutils import Quaternion, Vector

from capy_pose import CAN_BOTTOM, ROSE_FACE, SPOUT_DIR, controls, eul

FPS = 24
TAU = math.tau

# --------------------------------------------------------------------------- helpers
def wave(t, cycles=1.0, phase=0.0):
    return math.sin(TAU * (cycles * t + phase))


def bump(t, center, width):
    """Smooth periodic bump in [0, 1] around `center` (t, center in loop units)."""
    d = abs(((t - center + 0.5) % 1.0) - 0.5)
    if d >= width:
        return 0.0
    x = d / width
    return (1 - x * x) ** 2


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    if isinstance(a, tuple):
        return tuple(lerp(x, y, t) for x, y in zip(a, b))
    return a + (b - a) * t


def blink(f, frames, dur=5):
    for f0 in frames:
        d = f - f0
        if 0 <= d <= dur:
            return 1 - math.sin(math.pi * d / dur) * 0.96
    return 1.0


def float_loop(t, phase, rise=0.16, drift=0.03):
    """A prop that drifts up and fades in/out once per loop."""
    p = (t + phase) % 1.0
    s = math.sin(math.pi * p) ** 0.6
    return dict(scale=s, loc=(drift * math.sin(TAU * p), 0.0, rise * p))


def twinkle(t, phase, cycles=2, lo=0.55, hi=1.15, spin=25):
    w = 0.5 + 0.5 * math.sin(TAU * (cycles * t + phase))
    return dict(scale=lo + (hi - lo) * w, rot=(0, spin * math.sin(TAU * (t + phase)), 0))


def squash(v, head=0.46, arms=0.40):
    """Torso scale + matching head/arm lift so the head rides the body."""
    sx, sy, sz = v
    return dict(torso_scale=v, head_loc=(0, 0, (sy - 1) * head), arm_lift=(sy - 1) * arms)


def merge_lift(c, lift):
    for side in ("L", "R"):
        x, y, z = c.get(f"arm_{side}_loc", (0, 0, 0))
        c[f"arm_{side}_loc"] = (x, y, z + lift)
    return c


# arm poses (armature-space degrees, X raise, Y swing, Z sweep)
def arms_mirror(x, y, z):
    return dict(arm_L=(x, y, z), arm_R=(x, -y, -z))


# --------------------------------------------------------------------------- states
def calm(t, f, n):
    br = wave(t, 2)
    sq = squash((1 - 0.006 * br, 1 + 0.014 * br, 1 - 0.006 * br))
    tw = bump(t, 0.62, 0.05)
    b = blink(f, (26, 74))
    c = controls(
        torso_scale=sq["torso_scale"], head_loc=sq["head_loc"],
        head_rot=(2.0 * wave(t, 1, 0.1), 3.0 * wave(t, 1, 0.3), 7.0 * wave(t, 1)),
        ear_L=(0, 4 - 16 * tw, 0), ear_R=(0, -4, 0),
        eyes=("open", "open"), blink=(b, b), look=(0.004 * wave(t, 1), 0.0),
        brow_L=(0, 0.0), brow_R=(0, 0.0), mouth="smile", blush=1.0,
        props={"beret": 1.0}, **arms_mirror(-6 + 2 * br, 0, 0),
    )
    return merge_lift(c, sq["arm_lift"])


FOCUSED_ARM_L = (-11, 0, -8)
FOCUSED_ARM_R = (-11.5, 0, 9.6)
FOCUSED_ARM_L_LOC = (0, -0.02, 0)
FOCUSED_ARM_R_LOC = (0, -0.03, 0)


def focused(t, f, n):
    br = wave(t, 2)
    pause = bump(t, 0.5, 0.12)
    scrib = 0.0 if pause > 0.3 else 1.0
    b = blink(f, (52,))
    ax, ay, az = FOCUSED_ARM_R
    c = controls(
        torso_scale=(1, 1 + 0.01 * br, 1), body_rot=(3, 0, 0),
        head_rot=(7 - 5 * pause, 6 + 1.5 * wave(t, 1), 3 * wave(t, 1, 0.2)),
        ear_L=(0, -2, 0), ear_R=(0, 2, 0),
        eyes=("open", "open"), blink=(b, b), look=(-0.003 + 0.002 * wave(t, 4), -0.011 + 0.008 * pause),
        brow_L=(-10, -0.002), brow_R=(-10, -0.002), mouth="tongue", blush=1.0,
        arm_L=FOCUSED_ARM_L, arm_L_loc=FOCUSED_ARM_L_LOC, arm_R_loc=FOCUSED_ARM_R_LOC,
        arm_R=(ax + 1.5 * scrib * wave(t, 12, 0.25) - 6 * pause, ay + 5 * scrib * wave(t, 12), az),
        props={"beret": 1.0, "notebook": 1.0, "pencil": 1.0},
    )
    return c


def happy(t, f, n):
    sw = wave(t, 1)
    hop = abs(math.sin(TAU * t * 2))
    c = controls(
        root_loc=(0, 0, 0.012 * hop),
        body_rot=(0, 7 * sw, 0), torso_scale=(1 + 0.01 * hop, 1 - 0.015 * hop, 1 + 0.01 * hop),
        head_rot=(-4, -6 * wave(t, 1, 0.12), 4 * sw),
        ear_L=(0, 6 + 10 * wave(t, 2), 0), ear_R=(0, -6 + 10 * wave(t, 2), 0),
        eyes=("happy", "happy"), mouth="open", blush=1.35,
        brow_L=(4, 0.006), brow_R=(4, 0.006),
        **arms_mirror(-48 + 8 * wave(t, 2), 0, -14),
        props={"beret": 1.0, "yuzu": 1.0,
               "heart1": float_loop(t, 0.0), "heart2": float_loop(t, 0.36, 0.14), "heart3": float_loop(t, 0.7, 0.12)},
    )
    return c


def celebrate(t, f, n):
    p = (t * 2) % 1.0                      # two hops per loop
    q = min(1.0, max(0.0, (p - 0.12) / 0.70))
    air = 4 * q * (1 - q) if 0.12 < p < 0.82 else 0.0
    land = math.exp(-(((p - 0.86) % 1.0) / 0.07) ** 2) + math.exp(-(((p + 0.14) % 1.0) / 0.07) ** 2)
    land = min(1.0, land)
    stretch = 0.07 * math.sin(math.pi * q) if air > 0 else 0.0
    sq = squash((1 + 0.08 * land - 0.04 * stretch, 1 - 0.11 * land + stretch, 1 + 0.08 * land - 0.04 * stretch))
    wav = wave(t, 4)
    c = controls(
        root_loc=(0, 0, 0.15 * air),
        torso_scale=sq["torso_scale"], head_loc=sq["head_loc"],
        head_rot=(-6 + 5 * land, 3 * wave(t, 1), 0),
        ear_L=(0, -14 + 26 * land, 0), ear_R=(0, 14 - 26 * land, 0),
        eyes=("star", "star"), mouth="open", blush=1.35,
        brow_L=(6, 0.008), brow_R=(6, 0.008),
        arm_L=(-150 + 8 * wav, 66 + 8 * wav, 0), arm_R=(-150 - 8 * wav, -66 + 8 * wav, 0),
        props={"beret": {"scale": 1.0, "loc": (0, 0, 0.012 * land - 0.01 * air)},
               **{f"spark{i + 1}": twinkle(t, i * 0.21, cycles=2) for i in range(5)}},
    )
    return merge_lift(c, sq["arm_lift"])


def proud(t, f, n):
    bob = wave(t, 2)
    c = controls(
        root_loc=(0, 0, 0.005 * (1 + bob)),
        body_rot=(-6, 2 * wave(t, 1), 0), torso_scale=(1.03, 1.0 + 0.008 * bob, 1.03),
        head_rot=(-13, 4 * wave(t, 1, 0.2), 5 * wave(t, 1)),
        ear_L=(0, -8, 0), ear_R=(0, 8, 0),
        eyes=("closed", "closed"), mouth="smirk", blush=1.15,
        brow_L=(-4, 0.008), brow_R=(-4, 0.008),
        arm_L=(-62, 0, -42), arm_R=(14, 0, -22),
        props={"crown": 1.0, "spark2": twinkle(t, 0.0), "spark3": twinkle(t, 0.33), "spark5": twinkle(t, 0.66)},
    )
    return c


def sleepy(t, f, n):
    if t < 0.36:
        eyes, droop = "sleepy", lerp(4, 13, ease(t / 0.36))
    elif t < 0.80:
        eyes, droop = "closed", lerp(13, 24, ease((t - 0.36) / 0.44))
    elif t < 0.86:
        eyes, droop = "wide" if t < 0.83 else "sleepy", lerp(24, 0, ease((t - 0.80) / 0.04))
    else:
        eyes, droop = "sleepy", lerp(0, 4, ease((t - 0.86) / 0.14))
    br = wave(t, 2)
    bub = 0.0
    if 0.40 < t < 0.80:
        bub = 0.35 + 0.65 * ease((t - 0.40) / 0.36) + 0.06 * wave(t, 6)
    elif 0.80 <= t < 0.82:
        bub = 1.1
    c = controls(
        torso_scale=(1 - 0.008 * br, 1 + 0.02 * br, 1 - 0.008 * br), body_rot=(droop * 0.25, 0, 0),
        head_rot=(droop, 8 + 2 * wave(t, 1), 0),
        ear_L=(0, 26, 0), ear_R=(0, -26, 0),
        eyes=(eyes, eyes), mouth="o", mouth_scale=0.7 if eyes != "wide" else 1.0, blush=0.9,
        brow_L=(6, -0.003), brow_R=(6, -0.003),
        **arms_mirror(4, 0, 0),
        props={"beret": 1.0, "bubble": bub,
               "z1": float_loop(t, 0.0, 0.10, 0.02), "z2": float_loop(t, 0.33, 0.10, 0.02), "z3": float_loop(t, 0.66, 0.10, 0.02)},
    )
    return c


def worried(t, f, n):
    glance = math.tanh(3 * math.sin(TAU * t * 2)) / math.tanh(3)
    b = blink(f, (40,))
    tap = wave(t, 8)
    c = controls(
        body_rot=(2, 0, 0), torso_scale=(1, 1 + 0.008 * wave(t, 3), 1),
        head_rot=(4, 3, 7 * glance),
        ear_L=(-16, 8, 0), ear_R=(-16, -8, 0),
        eyes=("open", "open"), blink=(b, b), look=(0.006 * glance, 0.001),
        brow_L=(22, 0.006), brow_R=(22, 0.006), mouth="wavy", blush=0.7,
        arm_L=(-58 + 3 * tap, 0, -24), arm_R=(-58 - 3 * tap, 0, 24),
        props={"beret": 1.0, "sweat": {"scale": 0.92 + 0.08 * wave(t, 2), "loc": (0, 0, -0.012 * ((t * 2) % 1.0))}},
    )
    return c


def sad(t, f, n):
    sniff = bump(t, 0.5, 0.05)
    b = blink(f, (70,), dur=8)
    tears = {}
    for side, ph in (("L", 0.0), ("R", 0.5)):
        p = (t * 2 + ph) % 1.0
        tears[f"tear.{side}"] = dict(scale=(math.sin(math.pi * min(1.0, p * 1.4)) ** 0.5) * (1 - 0.3 * p),
                                     loc=(0, -0.01, -0.055 * ease(p)))
    drops = {f"drop{i + 1}": dict(scale=0.9 * (1 - ((t * 3 + i * 0.33) % 1.0) ** 3),
                                  loc=(0, 0, -0.34 * ((t * 3 + i * 0.33) % 1.0))) for i in range(3)}
    c = controls(
        body_rot=(6, 0, 0), torso_scale=(1.0, 0.97 + 0.02 * sniff, 1.0),
        head_loc=(0, 0, -0.012 + 0.008 * sniff),
        head_rot=(15 - 4 * sniff, 7, 2 * wave(t, 1)),
        ear_L=(-8, 42, 0), ear_R=(-8, -42, 0),
        eyes=("sad", "sad"), blink=(b, b), look=(0, -0.003),
        brow_L=(26, 0.002), brow_R=(26, 0.002), mouth="frown", blush=0.55,
        **arms_mirror(10, 0, -6),
        props={"beret": 1.0, **tears, "cloud": {"scale": 1.0, "loc": (0.02 * wave(t, 1), 0, 0.01 * wave(t, 2))}, **drops},
    )
    return c


def grumpy(t, f, n):
    stomp = bump(t, 0.25, 0.08) + bump(t, 0.75, 0.08)
    impact = bump(t, 0.31, 0.04) + bump(t, 0.81, 0.04)
    hmph = bump(t, 0.5, 0.08)
    puffs = {}
    for side, ph in (("L", 0.0), ("R", 0.5)):
        p = (t * 2 + ph) % 1.0
        s = 1.0 if side == "L" else -1.0
        puffs[f"puff.{side}"] = dict(scale=math.sin(math.pi * p) ** 0.7, loc=(s * 0.06 * p, 0, 0.03 * p))
    c = controls(
        root_loc=(0.003 * impact * wave(t, 20), 0, 0),
        body_rot=(-2, -2 * impact, 0), torso_scale=(1.02, 1.0 - 0.02 * impact, 1.02),
        head_rot=(-6 - 5 * hmph, -4, 20 + 3 * hmph),
        ear_L=(-20, 4, 0), ear_R=(-20, -4, 0),
        eyes=("angry", "angry"), look=(-0.005, 0.0),
        brow_L=(-26, -0.004), brow_R=(-26, -0.004), mouth="grr", blush=1.25,
        arm_L=(-72, 0, -34), arm_R=(-66, 0, 30), arm_L_loc=(0, -0.025, 0.01),
        foot_R=(-20 * stomp, 0, 0), foot_R_loc=(0, 0, 0.045 * stomp),
        props={"beret": 1.0, "anger": 0.85 + 0.3 * abs(wave(t, 3)), **puffs},
    )
    return c


def chilly(t, f, n):
    shiver = wave(t, 18)
    relief = 0.55 < t < 0.78
    rub = wave(t, 2)
    snow = {f"snow{i + 1}": dict(scale=math.sin(math.pi * ((t + i * 0.5) % 1.0)) ** 0.5,
                                 loc=(0.02 * wave(t, 1, i * 0.5), 0, -0.22 * ((t + i * 0.5) % 1.0)),
                                 rot=(0, 120 * ((t + i * 0.5) % 1.0), 0)) for i in range(2)}
    b = blink(f, (50,))
    c = controls(
        root_loc=(0.0045 * shiver, 0, 0), torso_scale=(1.0 + 0.006 * shiver, 0.98, 1.0),
        body_rot=(3, 0, 0), head_rot=(6, 2 * shiver, 0),
        ear_L=(-10, 18, 0), ear_R=(-10, -18, 0),
        eyes=("open", "open") if relief else ("squint", "squint"), blink=(b, b) if relief else (1, 1),
        mouth="smile" if relief else "wavy", mouth_scale=1.0 + (0 if relief else 0.08 * wave(t, 12)), blush=1.4,
        brow_L=(14, 0.003), brow_R=(14, 0.003),
        arm_L=(-52, 0, -44 + 6 * rub), arm_R=(-52, 0, 44 + 6 * rub),
        props={"beret": 1.0, "scarf": 1.0, "scarf_tail": {"scale": 1.0, "rot": (4 * wave(t, 2), 0, 3 * shiver)}, **snow},
    )
    return c


def surprised(t, f, n):
    """One-shot (36 frames). Frame 0 and the last frame match `calm`."""
    def seg(a, b):
        return ease((f - a) / (b - a))

    jump = seg(3, 7) * (1 - seg(9, 13))
    antic = seg(0, 3) * (1 - seg(3, 6))
    settle = seg(24, 34)
    land = seg(11, 13) * (1 - seg(13, 17))
    shock = 1.0 - settle
    vib = 0.0 if f < 8 or f > 24 else 0.002 * math.sin(f * 2.6)
    sq = squash((1 + 0.05 * antic + 0.05 * land - 0.04 * jump, 1 - 0.08 * antic - 0.07 * land + 0.07 * jump,
                 1 + 0.05 * antic + 0.05 * land - 0.04 * jump))
    ex = seg(4, 8) * 1.25 - seg(8, 12) * 0.25
    ex = ex * (1 - seg(26, 32))
    open_eyes = f >= 3 and f < 28
    c = controls(
        root_loc=(vib, 0.035 * jump, 0.075 * jump),
        torso_scale=sq["torso_scale"], head_loc=sq["head_loc"],
        head_rot=(-4 * jump + 3 * antic, 0, 0),
        ear_L=(6 * shock * seg(3, 6), -14 * shock * seg(3, 6), 0), ear_R=(6 * shock * seg(3, 6), 14 * shock * seg(3, 6), 0),
        eyes=("wide", "wide") if open_eyes else ("open", "open"), eye_scale=1.0 + 0.06 * jump,
        brow_L=(8 * shock * seg(3, 6), 0.013 * shock * seg(3, 6)), brow_R=(8 * shock * seg(3, 6), 0.013 * shock * seg(3, 6)),
        mouth="o" if open_eyes else "smile", mouth_scale=1.15 if open_eyes else 1.0, blush=1.0,
        arm_L=lerp((-6, 0, 0), (-70, 28, 0), seg(3, 7) * (1 - settle)),
        arm_R=lerp((-6, 0, 0), (-70, -28, 0), seg(3, 7) * (1 - settle)),
        props={"beret": {"scale": 1.0, "loc": (0, 0, 0.02 * jump)}, "exclaim": max(0.0, ex)},
    )
    return merge_lift(c, sq["arm_lift"])


def confused(t, f, n):
    """Puzzled 'huh?': head tilt, one brow up, paw on the cheek, a bobbing question mark."""
    tilt = math.tanh(2.2 * math.sin(TAU * t)) / math.tanh(2.2)      # holds at both ends
    b = blink(f, (30, 62))
    c = controls(
        body_rot=(0, -2 + 2 * tilt, 0), torso_scale=(1, 1 + 0.008 * wave(t, 2), 1),
        head_rot=(-3, -9 + 5 * tilt, 5 * tilt),
        ear_L=(4, -10, 0), ear_R=(-6, -24 + 6 * tilt, 0),
        eyes=("open", "open"), blink=(b, b), look=(-0.003 + 0.003 * tilt, 0.007),
        brow_L=(-8, -0.001), brow_R=(6, 0.014),
        mouth="o", mouth_scale=0.7, mouth_loc=(0.006, 0.0), blush=0.8,
        arm_L=(-8, 0, 0), arm_R=(-88 + 3 * wave(t, 2), 0, -32),
        props={"beret": 1.0,
               "question": {"scale": 1.0 + 0.06 * wave(t, 2), "loc": (0, 0, 0.008 * wave(t, 1)), "rot": (0, 8 * wave(t, 1, 0.1), 0)}},
    )
    return c


# =========================================================================== world activities
_RIG = {}


def use_rig(rig):
    """Bind the CapyRig whose rest pose the world clips aim at (arm reach, held can, pour, feet)."""
    _RIG.clear()
    _RIG["rig"] = rig


def capy_rig():
    if "rig" not in _RIG:
        import bpy
        from capy_pose import CapyRig
        use_rig(CapyRig(bpy.data.objects["RIG_Capy"]))
    return _RIG["rig"]


def deg(q):
    """Armature-space Euler degrees of a quaternion, in the order eul() applies them."""
    return tuple(math.degrees(a) for a in q.to_euler("XYZ"))


def seg(f, a, b):
    """Eased 0 -> 1 over frames a..b."""
    return ease((f - a) / (b - a))


def hermite(p0, p1, m0, m1, s):
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1


def arm_aim(target, side="R", loc=(0, 0, 0), body_rot=(0, 0, 0), root_loc=(0, 0, 0)):
    """arm_<side> rotation that points the paw centre at model-space `target` while the body is turned by
    body_rot and the root moved by root_loc; `loc` is the arm's own offset. Returns (euler, reach error)."""
    r = capy_rig()
    pivot = r.head["body"]
    p = eul(*body_rot).inverted() @ (Vector(target) - Vector(root_loc) - pivot) + pivot
    name = f"arm.{side}"
    h = r.head[name] + Vector(loc)
    d0 = r.tail[name] - r.head[name]
    return deg(d0.rotation_difference(p - h)), (p - h).length - d0.length


def held(body_rot, arm_rot, want=(0, 0, 0)):
    """Rotation of the can (child of arm.R) that gives it the model-space orientation eul(*want)."""
    return deg((eul(*body_rot) @ eul(*arm_rot)).inverted() @ eul(*want))


# ---------------------------------------------------------------- walking
# One cycle = two steps. Phase ph: 0 = left heel strike, 0.5 = right heel strike. The stance foot's
# ellipsoid sole rolls heel -> flat -> toe without slipping on ground that moves back at the walk speed;
# the swing foot leaves and lands matching that speed. Arms swing against the legs from the shoulder.
WALK = dict(cycle=18, cycles=2, duty=0.58, S=0.40, lift=0.060, stand=0.030, bob=0.022, hs=-14.0, to=26.0,
            flat=(0.16, 0.62), roll=5.0, sway=0.016, yaw=5.0, lean=5.0, arm=26.0, arm_back=18.0, arm_base=-10.0,
            arm_out=10.0, arm_roll=10.0, arm_lag=0.04, head_keep=0.6, circ=0.012)
FOOT = dict(b=0.12, c=0.062, splay=14.0, centre=(0.17, -0.25, 0.055))   # sole ellipsoid of the capy_build feet
GROUND = FOOT["centre"][2] - FOOT["c"]                                   # rest sole height (-0.007)
CARRY_PAW = Vector((-0.40, -0.19, 0.33))     # right paw while carrying: beside the hip, can clear of the feet
CARRY_LOC = (-0.03, -0.01, 0.0)


def walk_speed():
    """Model units per second the app moves the root at timeScale 1 (S per 18-frame cycle)."""
    return WALK["S"] / (WALK["cycle"] / FPS)


def carry_arm():
    if "carry" not in _RIG:
        _RIG["carry"] = arm_aim(CARRY_PAW, loc=CARRY_LOC)[0]
    return _RIG["carry"]


def roll_h(th):
    """Height of the foot ellipsoid's centre above its contact point at pitch th (rad)."""
    b, c = FOOT["b"], FOOT["c"]
    return math.sqrt((b * math.sin(th)) ** 2 + (c * math.cos(th)) ** 2)


def roll_travel(th, n=24):
    """Centre travel along the foot when it rolls from flat to pitch th without slipping (Simpson on roll_h)."""
    if abs(th) < 1e-9:
        return 0.0
    hs = th / n
    acc = roll_h(0.0) + roll_h(th)
    for i in range(1, n):
        acc += (4 if i % 2 else 2) * roll_h(i * hs)
    return acc * hs / 3.0


def foot_axes(s):
    a = math.radians(s * FOOT["splay"])
    return Vector((math.sin(a), -math.cos(a), 0.0)), Quaternion((0, 0, 1), a)   # forward along the foot, splay


def pitch_q(s, th_deg):
    """Pitch about the foot's own lateral axis (+ = toe down), armature space."""
    _, rz = foot_axes(s)
    return rz @ Quaternion((1, 0, 0), math.radians(th_deg)) @ rz.inverted()


def stance_pitch(sp):
    W = WALK
    f0, f1 = W["flat"]
    if sp < f0:
        return W["hs"] * (1 - ease(sp / f0))                             # heel strike -> foot flat
    if sp > f1:
        return W["to"] * ease((sp - f1) / (1 - f1)) ** 1.15              # heel off -> rolls over the toe
    return 0.0


def swing_pitch(sw):
    W = WALK
    if sw < 0.15:
        return W["to"] + 8.0 * ease(sw / 0.15)                           # toe flicks back after lift-off
    if sw < 0.80:
        return (W["to"] + 8.0) + (W["hs"] - W["to"] - 8.0) * ease((sw - 0.15) / 0.65)
    return W["hs"]                                                        # toe up, ready for heel strike


def foot_pose(p, s):
    """Foot at gait phase p (0 = heel strike) for side s (+1 = L): (bone loc, bone quat) in armature space."""
    W = WALK
    D = W["duty"]
    A_ = W["S"] * D / 2.0
    u, _ = foot_axes(s)
    cr = Vector((s * FOOT["centre"][0], FOOT["centre"][1], FOOT["centre"][2]))
    head = capy_rig().head[f"foot.{'L' if s > 0 else 'R'}"]

    def stance_centre(sp):
        th = stance_pitch(sp)
        r = math.radians(th)
        return cr + Vector((0.0, -A_ + 2 * A_ * sp, 0.0)) + u * roll_travel(r) + Vector((0, 0, roll_h(r) - FOOT["c"])), th

    if p < D:
        ctr, th = stance_centre(p / D)
    else:
        sw = (p - D) / (1 - D)
        c0, _ = stance_centre(1.0)
        c1, _ = stance_centre(0.0)
        g = 2 * A_ / D * (1 - D)                                          # ground travel per unit of swing phase
        y = hermite(c0.y, c1.y, 0.45 * g, 0.55 * g, sw)                  # lifts off and lands moving back
        x = c0.x + (c1.x - c0.x) * ease(sw) + s * W["circ"] * math.sin(math.pi * sw)   # slight circumduction
        th = swing_pitch(sw)
        z = cr.z + roll_h(math.radians(th)) - FOOT["c"] + W["lift"] * math.sin(math.pi * min(1.0, sw ** 0.85)) ** 0.9
        ctr = Vector((x, y, z))
    q = pitch_q(s, th)
    return ctr + q @ (head - cr) - head, q


def bob_shape(ph):
    """0 at the down pose (just after each contact), 1 at the up pose (passing). Twice per cycle."""
    uu = ((2 * ph) % 1.0 - 0.10) % 1.0
    return ease(uu / 0.45) if uu < 0.45 else 1.0 - ease((uu - 0.45) / 0.55)


def walk(t, f, n, carry=False):
    W = WALK
    ph = (t * W["cycles"]) % 1.0
    b = bob_shape(ph)
    blag = bob_shape(ph - 0.08)                       # follow-through: head nod, beret, can
    elag = bob_shape(ph - 0.11)                       # ears lag a little more
    side = math.sin(TAU * (ph - 0.04))                # +1 = weight over the left foot (its mid-stance)
    rlag = math.sin(TAU * (ph - 0.14))
    roll = W["roll"] * (0.6 if carry else 1.0) * side + (1.5 if carry else 0.0)   # carrying: lean away from the can
    yaw = -W["yaw"] * math.cos(TAU * ph)              # left hip forward with the left foot
    k = (1.0 - b) ** 2                                # squash peaks at the down pose
    sq = squash((1 + 0.012 * k, 1 - 0.024 * k, 1 + 0.012 * k))
    root = Vector((W["sway"] * side * (0.7 if carry else 1.0), 0.0, W["stand"] + W["bob"] * b))
    feet = {}
    for sd, s, p in (("L", 1.0, ph), ("R", -1.0, (ph + 0.5) % 1.0)):
        loc, q = foot_pose(p, s)
        feet[sd] = (tuple(loc - root), deg(q))
    body_rot = (W["lean"] + 1.0 * k, roll, yaw)
    # head: counter-rotates the body so the eyes stay level, keeping 40% of the roll and a lagging nod
    head_w = eul(1.0 + 1.6 * (1 - blag), roll * (1 - W["head_keep"]), yaw * 0.15)
    head_rot = deg(eul(*body_rot).inverted() @ head_w)
    # arms: left arm forward with the right foot, eased extremes, paws drag a little behind
    sw = math.cos(TAU * (ph - W["arm_lag"]))
    e = math.tanh(1.6 * sw) / math.tanh(1.6)          # +1 = left arm back
    zf = 4.0 * math.sin(TAU * (ph - W["arm_lag"]))
    aL = W["arm"] * e if e < 0 else W["arm_back"] * e         # swings further forward than back (belly)
    aR = -W["arm"] * e if e > 0 else -W["arm_back"] * e
    arm_L = (W["arm_base"] + aL, -(W["arm_out"] + W["arm_roll"] * max(0.0, e)), zf)
    arm_R = (W["arm_base"] + aR, W["arm_out"] + W["arm_roll"] * max(0.0, -e), zf)
    arm_R_loc = (0.0, 0.0, 0.0)
    props = {"beret": {"scale": 1.0, "loc": (0, 0, 0.004 * (blag - 0.5))}}
    if carry:                                         # right arm holds the can; it cancels 60% of the bob
        base = carry_arm()
        arm_R = (base[0] + 1.5 * (blag - 0.5), base[1], base[2])
        arm_R_loc = (CARRY_LOC[0], CARRY_LOC[1], CARRY_LOC[2] - 0.6 * W["bob"] * (b - 0.5))
        props["can"] = {"scale": 1.0, "rot": held(body_rot, arm_R, (2.0 * (blag - 0.5), 0.0, 0.0))}
    bl = blink(f, (26,))
    ear = 5 + 7 * (1 - 2 * elag)
    c = controls(
        root_loc=tuple(root), body_rot=body_rot,
        torso_scale=sq["torso_scale"], head_loc=sq["head_loc"], head_rot=head_rot,
        ear_L=(0, ear - 1.5 * rlag, 0), ear_R=(0, -ear - 1.5 * rlag, 0),
        eyes=("open", "open"), blink=(bl, bl), look=(0.0, 0.0),
        brow_L=(4, 0.004), brow_R=(4, 0.004), mouth="smile", blush=1.0,
        arm_L=arm_L, arm_R=arm_R, arm_R_loc=arm_R_loc,
        foot_L=feet["L"][1], foot_L_loc=feet["L"][0], foot_R=feet["R"][1], foot_R_loc=feet["R"][0],
        props=props,
    )
    return merge_lift(c, sq["arm_lift"])


def walk_can(t, f, n):
    return walk(t, f, n, carry=True)


# ---------------------------------------------------------------- turning on the spot
TURN = dict(cycle=18, cycles=2, duty=0.58, theta=60.0, lift=0.045, stand=0.012, bob=0.012, roll=3.0, sway=0.010, arm=8.0)


def turn_rate():
    """Degrees per second of root yaw at timeScale 1: a left (counter-clockwise from above) turn."""
    return TURN["theta"] / (TURN["cycle"] / FPS)


def turn_step(t, f, n):
    """Small stepping turn: the stance foot counter-rotates about the root axis at exactly the root's yaw rate,
    the swing foot steps round with a symmetric lift, so the clip also works reversed (right turn)."""
    T_ = TURN
    ph = (t * T_["cycles"]) % 1.0
    D = T_["duty"]
    phi_span = T_["theta"] * D
    b = 0.5 * (1 - math.cos(2 * TAU * (ph - 0.04)))   # low in double support, high at mid-stance
    side = math.sin(TAU * (ph - 0.04))
    root = Vector((T_["sway"] * side, 0.0, T_["stand"] + T_["bob"] * b))
    feet = {}
    for sd, p in (("L", ph), ("R", (ph + 0.5) % 1.0)):
        if p < D:
            phi, z = phi_span / 2 - phi_span * (p / D), 0.0
        else:
            sw = (p - D) / (1 - D)
            phi, z = -phi_span / 2 + phi_span * ease(sw), T_["lift"] * math.sin(math.pi * sw)
        q = Quaternion((0, 0, 1), math.radians(phi))
        head = capy_rig().head[f"foot.{sd}"]
        feet[sd] = (tuple(q @ head - head + Vector((0, 0, z)) - root), (0.0, 0.0, phi))
    roll = T_["roll"] * side
    body_rot = (2.0, roll, 0.0)
    head_rot = deg(eul(*body_rot).inverted() @ eul(1.0, roll * 0.4, 0.0))
    sw_a = T_["arm"] * math.cos(TAU * ph)
    bl = blink(f, (20,))
    sq = squash((1 + 0.008 * (1 - b), 1 - 0.016 * (1 - b), 1 + 0.008 * (1 - b)))
    c = controls(
        root_loc=tuple(root), body_rot=body_rot, torso_scale=sq["torso_scale"], head_loc=sq["head_loc"],
        head_rot=head_rot, ear_L=(0, 6 - 3 * b, 0), ear_R=(0, -6 + 3 * b, 0),
        eyes=("open", "open"), blink=(bl, bl), brow_L=(4, 0.004), brow_R=(4, 0.004), mouth="smile", blush=1.0,
        arm_L=(-10 + sw_a, -10, 0), arm_R=(-10 - sw_a, 10, 0),
        foot_L=feet["L"][1], foot_L_loc=feet["L"][0], foot_R=feet["R"][1], foot_R_loc=feet["R"][0],
        props={"beret": 1.0},
    )
    return merge_lift(c, sq["arm_lift"])


# ---------------------------------------------------------------- watering (loop): two pour pulses, drops reused
WATER = dict(paw=Vector((-0.40, -0.30, 0.40)), loc=(-0.03, -0.03, 0.0), tilt=50.0, body=(5.0, -2.0, -10.0))
DROP = dict(period=16, life=13, g=2.6, v0=0.30, scale=1.25, spread=(-0.018, 0.0, 0.018))


def water_pose(t):
    pulse = math.sin(TAU * 2 * t)                     # two little "sprinkle" shakes per loop
    br = math.sin(TAU * t)
    bx, by, bz = WATER["body"]
    body_rot = (bx + 0.8 * br, by, bz)
    arm_R, _ = arm_aim(WATER["paw"], loc=WATER["loc"], body_rot=WATER["body"])
    arm_R = (arm_R[0] + 1.5 * pulse, arm_R[1], arm_R[2])
    tw = bump(t, 0.7, 0.05)
    return controls(
        body_rot=body_rot, torso_scale=(1, 1 + 0.008 * br, 1),
        head_rot=(13 + 1.5 * br, -6, -10), ear_L=(0, 8 - 14 * tw, 0), ear_R=(0, -8, 0),
        eyes=("happy", "happy"), mouth="smile", blush=1.15, brow_L=(4, 0.006), brow_R=(4, 0.006),
        arm_L=(-24 + 2 * br, 0, -10), arm_R=arm_R, arm_R_loc=WATER["loc"],
        props={"beret": 1.0, "can": {"scale": 1.0, "rot": held(body_rot, arm_R, (WATER["tilt"] + 5.0 * pulse, 0, -14.0))}},
    )


def rose_at(t):
    """Model-space centre and direction of the can's sprinkler face in the Water pose at loop time t."""
    r = capy_rig()
    M = r.fk(r.solve(water_pose(t % 1.0)))
    grip = r.head["can"]
    p = r.carried(M, "can", grip + ROSE_FACE)
    return p, (r.carried(M, "can", grip + ROSE_FACE + SPOUT_DIR) - p).normalized()


def drop_state(f, n):
    """drop1-3 (children of root) leave the rose and fall to the ground, where they splat.
    Returns (props, [model-space landing points this frame])."""
    out, landed = {}, []
    per, life = DROP["period"], DROP["life"]
    for i in range(3):
        name = f"drop{i + 1}"
        age = (f + i * per / 3.0) % per
        if age > life:
            out[name] = 0.0
            continue
        p0, d = rose_at((f - age) / n)
        dt = age / FPS
        pos = p0 + d * DROP["v0"] * dt + Vector((DROP["spread"][i], 0, -0.5 * DROP["g"] * dt * dt))
        sc = DROP["scale"] * min(1.0, 0.35 + age / 2.0)
        scale = (sc, sc, sc)
        if pos.z < 0.012:
            pos.z = 0.012
            scale = (sc * 1.5, sc * 0.45, sc * 1.5)
            landed.append(pos.copy())
        out[name] = {"scale": scale, "loc": tuple(pos - capy_rig().head[name])}
    return out, landed


def water(t, f, n):
    c = water_pose(t)
    c["props"].update(drop_state(f, n)[0])
    return c


# ---------------------------------------------------------------- one-shots (start and end near Calm)
def wave_hello(t, f, n):
    """Little hop, then the left paw waves beside the cheek (the arm cannot reach over the head)."""
    antic = seg(f, 0, 3) * (1 - seg(f, 3, 6))
    q = (f - 4) / 7.0
    air = 4 * q * (1 - q) if 0 < q < 1 else 0.0
    land = seg(f, 10, 12) * (1 - seg(f, 12, 16))
    up = seg(f, 9, 15) * (1 - seg(f, 34, 42))
    wv = math.sin(TAU * (f - 15) / 7.0) * seg(f, 14, 17) * (1 - seg(f, 31, 35)) if 14 <= f <= 35 else 0.0
    sq = squash((1 + 0.05 * antic + 0.05 * land - 0.03 * air, 1 - 0.07 * antic - 0.06 * land + 0.05 * air,
                 1 + 0.05 * antic + 0.05 * land - 0.03 * air))
    joy = 7 <= f < 38
    c = controls(
        root_loc=(0, 0, 0.055 * air), body_rot=(-2 * up, 2 * up, 0),
        torso_scale=sq["torso_scale"], head_loc=sq["head_loc"],
        head_rot=(-5 * up + 3 * antic, 9 * up, 2 * wv),
        ear_L=(0, -10 * up + 6 * land, 0), ear_R=(0, 10 * up - 6 * land, 0),
        eyes=("happy", "happy") if joy else ("open", "open"), mouth="open" if joy else "smile",
        blush=1.0 + 0.3 * up, brow_L=(6 * up, 0.008 * up), brow_R=(6 * up, 0.008 * up),
        arm_L=(-6 - 64 * up + 6 * wv, 80 * up + 14 * wv, 40 * up), arm_L_loc=(0.02 * up, -0.02 * up, 0.03 * up),
        arm_R=(-6 - 6 * up, 4 * up, 0),
        foot_L=(-8 * air, 0, 0), foot_R=(-8 * air, 0, 0),
        props={"beret": {"scale": 1.0, "loc": (0, 0, 0.012 * air)}},
    )
    return merge_lift(c, sq["arm_lift"])


def sniff(t, f, n):
    """Lean in, sniff-nod at a flower head, eyes-closed bliss, back up."""
    lean = seg(f, 2, 14) * (1 - seg(f, 46, 58))
    sn = math.sin(TAU * (f - 14) / 5.0) * (seg(f, 14, 16) * (1 - seg(f, 30, 33))) if 14 <= f <= 33 else 0.0
    bliss = seg(f, 31, 35) * (1 - seg(f, 46, 52))
    shiver = math.sin(f * 2.4) * bliss * 1.4
    eyes = "open" if f < 31 else "closed" if f < 47 else "happy" if f < 54 else "open"
    rise = 0.026 * lean                                # keeps the belly out of the ground while leaning
    return controls(
        root_loc=(0, 0, rise), foot_L_loc=(0, 0, -rise), foot_R_loc=(0, 0, -rise),
        body_rot=(13 * lean, shiver, 0), torso_scale=(1, 1 - 0.01 * lean, 1),
        head_rot=(21 * lean + 2.2 * sn - 6 * bliss, 7 * bliss, 0),
        ear_L=(-12 * lean, 4 + 14 * bliss, 0), ear_R=(-12 * lean, -4 - 14 * bliss, 0),
        eyes=(eyes, eyes), look=(0.0, -0.006 * lean * (1 - bliss)),
        brow_L=(5, 0.004 + 0.006 * bliss), brow_R=(5, 0.004 + 0.006 * bliss),
        mouth="smile", mouth_scale=1.0 + 0.15 * bliss, blush=1.0 + 0.4 * bliss,
        arm_L=(-6 - 16 * lean, 0, -6 * lean), arm_R=(-6 - 16 * lean, 0, 6 * lean),
        props={"beret": 1.0},
    )


PICK = dict(grab=10, paw=Vector((-0.345, -0.335, -CAN_BOTTOM.z + 0.002)), lean=(20.0, -4.0, -8.0),
            rise=0.040, loc=(-0.02, -0.03, -0.03), squash=(0.06, -0.12, 0.06))


def pick_lift(down=1.0):
    """Arm lift merge_lift adds at crouch amount `down` (the reach target pre-compensates it)."""
    k = PICK["squash"]
    return squash((1 + k[0] * down, 1 + k[1] * down, 1 + k[2] * down))["arm_lift"]


def pickup(t, f, n):
    """Crouch, take the can standing on the ground at the grab frame, lift it to the carry pose.
    Played backwards it is PutDown: the can is set down and leaves the paw at the grab frame."""
    down = seg(f, 0, 8) * (1 - seg(f, 13, 22))
    lift = seg(f, 13, 22)
    holding = f >= PICK["grab"]
    lx, ly, lz = PICK["lean"]
    body_rot = (lx * down, ly * down, lz * down)
    rise = PICK["rise"] * down
    k = PICK["squash"]
    sq = squash((1 + k[0] * down, 1 + k[1] * down, 1 + k[2] * down))
    # the reach is solved at the full crouch, so the can stands exactly on the ground at the grab frame
    reach, _ = arm_aim(PICK["paw"] - Vector((0, 0, pick_lift())), loc=PICK["loc"],
                       body_rot=PICK["lean"], root_loc=(0, 0, PICK["rise"]))
    if not holding or lift == 0:
        arm_R, loc = lerp((-6.0, 0.0, 0.0), reach, down), lerp((0.0, 0.0, 0.0), PICK["loc"], down)
    else:
        arm_R, loc = lerp(reach, carry_arm(), lift), lerp(PICK["loc"], CARRY_LOC, lift)
    c = controls(
        root_loc=(0, 0, rise), foot_L_loc=(0, 0, -rise), foot_R_loc=(0, 0, -rise),
        body_rot=body_rot, torso_scale=sq["torso_scale"], head_loc=sq["head_loc"],
        head_rot=(10 * down, 0, -8 * down), ear_L=(0, 6, 0), ear_R=(0, -6, 0),
        eyes=("open", "open"), look=(0.0, -0.008 * down), mouth="smile",
        brow_L=(3, 0.004), brow_R=(3, 0.004), blush=1.0,
        arm_L=(-8 - 10 * down, 0, 0), arm_R=arm_R, arm_R_loc=loc,
        props={"beret": 1.0, "can": {"scale": 1.0 if holding else 0.0, "rot": held(body_rot, arm_R)}},
    )
    return merge_lift(c, sq["arm_lift"])


STATES = {
    # name: (fn, frames, loop, hero_t, streak meaning)
    "Calm": (calm, 96, True, 0.1),
    "Focused": (focused, 96, True, 0.2),
    "Happy": (happy, 72, True, 0.3),
    "Celebrate": (celebrate, 48, True, 0.24),
    "Proud": (proud, 72, True, 0.3),
    "Sleepy": (sleepy, 96, True, 0.6),
    "Worried": (worried, 72, True, 0.18),
    "Sad": (sad, 96, True, 0.3),
    "Grumpy": (grumpy, 72, True, 0.3),
    "Chilly": (chilly, 72, True, 0.3),
    "Confused": (confused, 72, True, 0.25),
    "Surprised": (surprised, 36, False, 10 / 35),
}

ACTIVITIES = {
    # name: (fn, frames, loop, hero_t)  in place: the app moves/turns the root (walk_speed, turn_rate)
    "Walk": (walk, 36, True, 0.0),
    "WalkCan": (walk_can, 36, True, 0.0),
    "TurnStep": (turn_step, 36, True, 5 / 36),
    "Water": (water, 48, True, 0.30),
    "Sniff": (sniff, 60, False, 40 / 59),
    "Wave": (wave_hello, 44, False, 22 / 43),
    "PickUp": (pickup, 24, False, 1.0),     # can appears at PICK["grab"]; played backwards = PutDown
}

CLIPS = {**STATES, **ACTIVITIES}


def controls_at(name, t=None, frame=None):
    fn, n, loop, hero = CLIPS[name]
    if frame is None:
        frame = round((hero if t is None else t) * (n if loop else n - 1))
    tt = frame / n if loop else frame / (n - 1)
    return fn(tt, frame, n)


# --------------------------------------------------------------------------- baking
def bake_actions(rig_ob, names=None, step=1):
    """Create one Action per clip with keys on every bone (LINEAR, sampled every `step`)."""
    import bpy
    from bpy_extras import anim_utils
    from capy_pose import CapyRig

    rig = CapyRig(rig_ob)
    use_rig(rig)
    if rig_ob.animation_data is None:
        rig_ob.animation_data_create()
    ad = rig_ob.animation_data
    made = []
    for name in (names or CLIPS.keys()):
        fn, n, loop, _ = CLIPS[name]
        act_name = name
        if act_name in bpy.data.actions:
            bpy.data.actions.remove(bpy.data.actions[act_name])
        act = bpy.data.actions.new(act_name)
        act.use_fake_user = True
        slot = act.slots.new(id_type="OBJECT", name=rig_ob.name)
        cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
        last = n if loop else n - 1
        frames = list(range(0, last + 1, step))
        if frames[-1] != last:
            frames.append(last)
        samples = {}
        prev_q = {}
        for fr in frames:
            tt = fr / n if loop else fr / (n - 1)
            T = rig.solve(fn(tt % 1.0 if loop else tt, fr % n if loop else fr, n))
            for bname, (loc, rot, scl) in T.items():
                q = rot.copy()
                if bname in prev_q and prev_q[bname].dot(q) < 0:
                    q.negate()
                prev_q[bname] = q
                samples.setdefault(bname, []).append((fr, loc, q, scl))
        for bname, rows in samples.items():
            base = f'pose.bones["{bname}"]'
            for prop, size, getter in (("location", 3, lambda r: r[1]), ("rotation_quaternion", 4, lambda r: r[2]),
                                       ("scale", 3, lambda r: r[3])):
                for i in range(size):
                    vals = [(r[0] + 1, getter(r)[i]) for r in rows]   # Blender frames start at 1
                    constant = all(abs(v - vals[0][1]) < 1e-6 for _, v in vals)
                    keys = [vals[0], vals[-1]] if constant else vals
                    fc = cb.fcurves.new(f"{base}.{prop}", index=i, group_name=bname)
                    fc.keyframe_points.add(len(keys))
                    flat = [c for kv in keys for c in kv]
                    fc.keyframe_points.foreach_set("co", flat)
                    for kp in fc.keyframe_points:
                        kp.interpolation = "LINEAR"
                    fc.update()
        act.frame_range = (1, last + 1)
        act.use_frame_range = True
        act.use_cyclic = loop
        # keep every clip reachable for the glTF exporter (ACTIONS mode) via a muted NLA track
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, act)
        strip.action_slot = slot
        track.mute = True
        made.append({"name": name, "frames": last + 1, "loop": loop})
    ad.action = bpy.data.actions[made[0]["name"]] if made else None
    if made:
        ad.action_slot = ad.action.slots[0]
    return made
