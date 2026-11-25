"""Bake every emotional state into its own Action and export Capy as a web GLB.

  blender -b art/capy/capy.blend --python-exit-code 1 -P art/capy/capy_export.py -- \
      --glb public/models/capy.glb [--save] [--meshopt] [--states Calm,Happy]

* One Action per state (keys on every bone, LINEAR, 24 fps, loops have first == last frame).
* Every Action sits on a muted NLA track so the glTF exporter (ACTIONS mode) writes one clip each.
* Expression variants and props are bone-scale toggles, so each clip carries scale tracks for
  them and switching clips in three.js resets anything the previous clip showed.
"""
import json
import os
import struct
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep art/capy free of __pycache__
sys.path.insert(0, HERE)
import capy_anim as A  # noqa: E402


def glb_summary(path):
    """Parse the JSON chunk of a .glb and report what an engine will see."""
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2, "not a glTF 2.0 binary"
    jlen, jtype = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20:20 + jlen])
    acc = gltf.get("accessors", [])
    tris = 0
    prims = 0
    for m in gltf.get("meshes", []):
        for p in m["primitives"]:
            prims += 1
            if "indices" in p:
                tris += acc[p["indices"]]["count"] // 3
    clips = []
    for a in gltf.get("animations", []):
        dur = max(acc[s["input"]]["max"][0] for s in a["samplers"])
        paths = {}
        for ch in a["channels"]:
            paths[ch["target"]["path"]] = paths.get(ch["target"]["path"], 0) + 1
        interp = sorted({s.get("interpolation", "LINEAR") for s in a["samplers"]})
        clips.append({"name": a["name"], "seconds": round(dur, 3), "channels": len(a["channels"]),
                      "paths": paths, "interpolation": interp})
    return {
        "bytes": len(data), "kb": round(len(data) / 1024, 1),
        "meshes": len(gltf.get("meshes", [])), "primitives": prims, "tris": tris,
        "vertices": sum(acc[p["attributes"]["POSITION"]]["count"] for m in gltf.get("meshes", []) for p in m["primitives"]),
        "attributes": sorted({k for m in gltf.get("meshes", []) for p in m["primitives"] for k in p["attributes"]}),
        "materials": [m.get("name") for m in gltf.get("materials", [])],
        "images": len(gltf.get("images", [])),
        "skins": [{"joints": len(s["joints"])} for s in gltf.get("skins", [])],
        "nodes": len(gltf.get("nodes", [])),
        "extensionsUsed": gltf.get("extensionsUsed", []),
        "extensionsRequired": gltf.get("extensionsRequired", []),
        "animations": clips,
    }


def export_glb(path, rig, mesh, meshopt=False):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    for ob in bpy.data.objects:
        ob.select_set(ob in (rig, mesh))
    bpy.context.view_layer.objects.active = rig
    kw = dict(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=False, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_materials="EXPORT", export_image_format="AUTO",
        export_vertex_color="MATERIAL", export_all_vertex_colors=False,
        export_skins=True, export_influence_nb=4, export_def_bones=True, export_leaf_bone=False,
        export_rest_position_armature=True,
        export_animations=True, export_animation_mode="ACTIONS", export_merge_animation="ACTION",
        export_force_sampling=True, export_frame_step=1, export_anim_slide_to_zero=True,
        export_reset_pose_bones=True, export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True, export_nla_strips=True,
        export_morph=False, export_cameras=False, export_lights=False,
    )
    if meshopt:
        kw.update(export_meshopt_compression_enable=True, export_meshopt_extension="EXT_meshopt_compression")
    res = bpy.ops.export_scene.gltf(**kw)
    if res != {"FINISHED"}:
        raise RuntimeError(f"glTF export failed: {res}")
    return glb_summary(path)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    glb = os.path.abspath(argv[argv.index("--glb") + 1]) if "--glb" in argv else os.path.join(HERE, "capy.glb")
    states = argv[argv.index("--states") + 1].split(",") if "--states" in argv else None
    rig = bpy.data.objects["RIG_Capy"]
    mesh = bpy.data.objects["SK_Capy"]
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.frame_start = 1
    scene.frame_end = max(A.STATES[s][1] + 1 for s in (states or A.STATES))
    made = A.bake_actions(rig, states)
    out = {"clips": made, "objects": [o.name for o in bpy.data.objects]}
    if "--save" in argv:
        bpy.context.preferences.filepaths.save_version = 0   # no .blend1 backup next to the source
        bpy.ops.wm.save_mainfile()
        out["saved"] = bpy.data.filepath
    out["glb"] = export_glb(glb, rig, mesh, meshopt="--compress" in argv)
    if "--raw" in argv:
        out["glb_raw"] = export_glb(os.path.abspath(argv[argv.index("--raw") + 1]), rig, mesh)
    print("@@JSON@@" + json.dumps(out))


if __name__ == "__main__":
    main()
