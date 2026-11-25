"""Presentation renders for Capy (EEVEE, soft studio light, warm ivory backdrop).

  blender -b art/capy/capy.blend --python-exit-code 1 -P art/capy/capy_render.py -- --preview OUT_DIR
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/capy free of __pycache__
sys.path.insert(0, HERE)

TARGET = Vector((0.0, -0.05, 0.60))
VIEWS = {
    "three_quarter": (Vector((1.25, -3.25, 1.25)), 70),
    "front": (Vector((0.0, -3.4, 0.95)), 70),
    "side": (Vector((3.45, -0.2, 0.95)), 70),
    "back": (Vector((-1.2, 3.2, 1.3)), 70),
    "close": (Vector((0.55, -2.1, 0.98)), 85),
}


def _hex(h):
    h = h.lstrip("#")
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return tuple(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def setup(res=(1000, 1000), samples=48, transparent=False, backdrop=True):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = samples
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    try:
        sc.view_settings.view_transform = "Khronos PBR Neutral"
    except TypeError:
        sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = -0.1

    world = sc.world or bpy.data.worlds.new("World")
    sc.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = _hex("#FFF4E8")
    bg.inputs["Strength"].default_value = 0.85

    def area(name, loc, power, size, color, target=TARGET):
        if name in bpy.data.objects:
            ob = bpy.data.objects[name]
        else:
            ld = bpy.data.lights.new(name, "AREA")
            ob = bpy.data.objects.new(name, ld)
            sc.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        ob.data.energy = power
        ob.data.size = size
        ob.data.color = color[:3]
        return ob

    area("L_Key", (-2.4, -3.4, 3.4), 700, 2.8, _hex("#FFF1E0"))
    area("L_Fill", (3.0, -2.6, 1.6), 220, 3.0, _hex("#ECE6FF"))
    area("L_Rim", (1.8, 3.2, 2.8), 600, 2.0, _hex("#FFE7C9"))

    if backdrop and "BG_Backdrop" not in bpy.data.objects:
        import bmesh
        bm = bmesh.new()
        # cyclorama: floor that curves up behind the character
        cols, rows = 24, 40
        verts = []
        for j in range(rows + 1):
            t = j / rows
            if t < 0.4:
                y, z = -8.0 + t / 0.4 * 9.5, 0.0
            elif t < 0.75:
                a = (t - 0.4) / 0.35 * (math.pi / 2)
                y, z = 1.5 + math.sin(a) * 3.0, (1 - math.cos(a)) * 3.0
            else:
                y, z = 4.5, 3.0 + (t - 0.75) / 0.25 * 9.0
            for i in range(cols + 1):
                verts.append(bm.verts.new((-12 + 24 * i / cols, y, z)))
        for j in range(rows):
            for i in range(cols):
                a = j * (cols + 1) + i
                f = bm.faces.new((verts[a], verts[a + 1], verts[a + cols + 2], verts[a + cols + 1]))
                f.smooth = True
        me = bpy.data.meshes.new("BG_Backdrop")
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("BG_Backdrop", me)
        sc.collection.objects.link(ob)
        mat = bpy.data.materials.new("M_Backdrop")
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = _hex("#FCEBDD")
        bsdf.inputs["Roughness"].default_value = 0.95
        bsdf.inputs["Specular IOR Level"].default_value = 0.2
        me.materials.append(mat)
    return sc


def camera(view="three_quarter", target=TARGET, lens=None):
    sc = bpy.context.scene
    if "CAM_Capy" in bpy.data.objects:
        cam = bpy.data.objects["CAM_Capy"]
    else:
        cam = bpy.data.objects.new("CAM_Capy", bpy.data.cameras.new("CAM_Capy"))
        sc.collection.objects.link(cam)
    loc, focal = VIEWS[view]
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens or focal
    cam.data.sensor_width = 36
    sc.camera = cam
    return cam


def render(path):
    sc = bpy.context.scene
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if sc.render.film_transparent else "RGB"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def pose(rig_ob, **kw):
    import capy_pose as P
    r = P.CapyRig(rig_ob)
    r.apply(r.solve(P.controls(**kw)))
    bpy.context.view_layer.update()


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.abspath(argv[argv.index("--preview") + 1]) if "--preview" in argv else os.path.join(HERE, "preview")
    views = argv[argv.index("--views") + 1].split(",") if "--views" in argv else ["three_quarter", "front", "side"]
    os.makedirs(out, exist_ok=True)
    setup(res=(900, 900), samples=32)
    rig = bpy.data.objects["RIG_Capy"]
    pose(rig)
    import json
    done = []
    for v in views:
        camera(v)
        done.append(render(os.path.join(out, f"calm_{v}.png")))
    print("@@JSON@@" + json.dumps({"renders": done}))
