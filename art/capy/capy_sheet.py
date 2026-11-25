"""Render one portrait per emotional state (hero frame), or every Nth frame of each state.
--states also takes the world activities (Walk, Water, ...); they render in place.

  blender -b art/capy/capy.blend --python-exit-code 1 -P art/capy/capy_sheet.py -- --out DIR
      [--size 640] [--states Calm,Happy] [--view sheet|sheet_front|face|front|side|back|three_quarter]
      [--lens 74] [--frame F] [--anim STEP] [--samples 32] [--turn 0,35,90,180]

--anim STEP writes DIR/<State>/0000.png ... (loops skip the last frame, which repeats frame 0).
--turn spins the character (root yaw, degrees) in front of a fixed camera: DIR/turn_<deg>.png.
"""
import json
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/capy free of __pycache__
sys.path.insert(0, HERE)
import capy_anim as A  # noqa: E402
import capy_pose as P  # noqa: E402
import capy_render as R  # noqa: E402

R.VIEWS["sheet"] = (Vector((0.85, -3.35, 1.32)), 64)
R.VIEWS["sheet_front"] = (Vector((0.0, -2.6, 1.0)), 70)
R.VIEWS["face"] = (Vector((0.35, -2.2, 0.95)), 85)


def arg(argv, name, default=None, cast=str):
    return cast(argv[argv.index(name) + 1]) if name in argv else default


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.abspath(arg(argv, "--out"))
    size = arg(argv, "--size", 640, int)
    states = arg(argv, "--states", ",".join(A.STATES)).split(",")
    view = arg(argv, "--view", "sheet")
    frame = arg(argv, "--frame", None, int)
    step = arg(argv, "--anim", None, int)
    lens = arg(argv, "--lens", None, float)
    tz = arg(argv, "--target-z", 0.74 if view != "face" else 0.66, float)
    os.makedirs(out, exist_ok=True)
    R.setup(res=(size, size), samples=arg(argv, "--samples", 32, int))
    R.camera(view, target=Vector((0.0, -0.05, tz)), lens=lens)
    rig = P.CapyRig(bpy.data.objects["RIG_Capy"])
    rig_ob = bpy.data.objects["RIG_Capy"]
    if rig_ob.animation_data:             # baked actions would override the procedural pose
        rig_ob.animation_data.action = None
        for tr in rig_ob.animation_data.nla_tracks:
            tr.mute = True
    done = []
    turns = arg(argv, "--turn")
    if turns:
        for deg in [float(x) for x in turns.split(",")]:
            c = A.controls_at(states[0], frame=frame)
            c["root_rot"] = (0.0, 0.0, deg)
            rig.apply(rig.solve(c))
            bpy.context.view_layer.update()
            done.append(R.render(os.path.join(out, f"turn_{int(deg)}.png")))
        states = []
    for name in states:
        if step:
            fn, n, loop, _ = A.CLIPS[name]
            d = os.path.join(out, name)
            os.makedirs(d, exist_ok=True)
            for i, f in enumerate(range(0, n if loop else n, step)):
                rig.apply(rig.solve(A.controls_at(name, frame=f)))
                bpy.context.view_layer.update()
                R.render(os.path.join(d, f"{i:04d}.png"))
            done.append(d)
        else:
            rig.apply(rig.solve(A.controls_at(name, frame=frame)))
            bpy.context.view_layer.update()
            done.append(R.render(os.path.join(out, f"{name}.png")))
    print("@@JSON@@" + json.dumps({"renders": done}))


main()
