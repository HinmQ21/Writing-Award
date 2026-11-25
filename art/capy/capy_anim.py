"""Capy emotional states -> looping animation clips (one Action per state).

Every state is a pure function of (t in [0, 1), frame, frame_count) that returns the
high-level controls from capy_pose. Loops use whole-number cycles, so frame 0 and the
last frame match. Each clip keys EVERY bone, so switching clips in three.js always
resets visibility toggles and props.
"""
import math

from capy_pose import controls

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


def controls_at(name, t=None, frame=None):
    fn, n, loop, hero = STATES[name]
    if frame is None:
        frame = round((hero if t is None else t) * (n if loop else n - 1))
    tt = frame / n if loop else frame / (n - 1)
    return fn(tt, frame, n)


# --------------------------------------------------------------------------- baking
def bake_actions(rig_ob, names=None, step=1):
    """Create one Action per state with keys on every bone (LINEAR, sampled every `step`)."""
    import bpy
    from bpy_extras import anim_utils
    from capy_pose import CapyRig

    rig = CapyRig(rig_ob)
    if rig_ob.animation_data is None:
        rig_ob.animation_data_create()
    ad = rig_ob.animation_data
    made = []
    for name in (names or STATES.keys()):
        fn, n, loop, _ = STATES[name]
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
