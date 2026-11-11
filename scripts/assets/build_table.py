"""
Grammar Casino: the casino table and room, built by script (package V2).

    python scripts/assets/build_table.py --out public/models/

Needs Blender's Python module (pip install bpy). It models everything procedurally, paints the
colour textures with numpy (felt with a printed betting line and pot circle, leather grain, wood
grain), and exports two glTF files. Normal maps were tried and left out: in three.js they lit the
rail and apron white.

  table.glb  Table_Felt, Table_Rail, Table_Trim, Table_Apron, Pot_Ring, Dealer_Tray and
             Seat_Anchor_00 .. Seat_Anchor_39 (12 seats on the rail, 28 in the gallery behind)
  room.glb   Room_Floor, Room_Walls, Lamp_Shade_L/R, Lamp_Bulb_L/R

Units match the three.js scene in components/Tabletop3DOverlay.tsx: the felt is at height 0,
the pot is at (0, 0, -0.35) and the camera looks from the front (+Z in three.js, -Y in Blender).
"""

import argparse
import math
import os
import sys


import bpy
import bmesh  # available once bpy is loaded
import numpy as np

TEX = 1024
FELT_RX, FELT_RZ = 3.9, 2.9  # half sizes of the felt oval, in metres
CENTER_Z = -0.1  # three.js z of the table centre


def b(x, z, y=0.0):
    """three.js (x, y, z) to Blender (x, -z, y)."""
    return (x, -z, y)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# --- textures painted with numpy -------------------------------------------------------------

def image_from_array(name, rgb, non_color=False):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=False)
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    img.pack()
    return img


def fbm(shape, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out = np.zeros(shape)
    amp = 1.0
    for o in range(octaves):
        cells = 8 * 2 ** o
        grid = rng.random((cells + 1, cells + 1))
        ys = np.linspace(0, cells, shape[0], endpoint=False)
        xs = np.linspace(0, cells, shape[1], endpoint=False)
        y0, x0 = ys.astype(int), xs.astype(int)
        fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        a = grid[y0][:, x0]
        bb = grid[y0][:, x0 + 1]
        c = grid[y0 + 1][:, x0]
        d = grid[y0 + 1][:, x0 + 1]
        out += amp * (a * (1 - fx) * (1 - fy) + bb * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy)
        amp *= 0.5
    return out / out.max()


def felt_textures():
    v, u = np.mgrid[0:TEX, 0:TEX] / TEX
    weave = 0.5 + 0.25 * np.sin(u * TEX * math.pi * 0.9) * np.sin(v * TEX * math.pi * 0.9)
    noise = fbm((TEX, TEX), 7)
    height = 0.6 * weave + 0.4 * noise
    base = np.array([0.02, 0.25, 0.13])
    rgb = base[None, None, :] * (0.82 + 0.3 * noise[..., None]) * (0.95 + 0.1 * weave[..., None])
    # Printed betting line and pot circle in gold, in the felt's top-down UV space.
    x = (u - 0.5) * 2 * FELT_RX
    z = (v - 0.5) * 2 * FELT_RZ
    ring = np.abs(np.sqrt((x / (FELT_RX - 0.55)) ** 2 + (z / (FELT_RZ - 0.55)) ** 2) - 1.0)
    line = (ring < 0.006).astype(float)
    pot = np.abs(np.sqrt(x ** 2 + (z - (-0.35 - CENTER_Z)) ** 2) - 0.62)
    line = np.maximum(line, (pot < 0.012).astype(float))
    gold = np.array([0.78, 0.58, 0.2])
    rgb = rgb * (1 - line[..., None]) + gold[None, None, :] * line[..., None]
    return image_from_array("Felt_BaseColor", rgb * (0.94 + 0.12 * height[..., None])), None


def leather_textures():
    n = fbm((512, 512), 11, 5)
    grain = np.abs(n - 0.5) * 2
    rgb = np.array([0.26, 0.07, 0.045])[None, None, :] * (0.8 + 0.4 * n[..., None])
    return (
        image_from_array("Leather_BaseColor", rgb * (0.85 + 0.3 * grain[..., None])),
    )


def wood_textures():
    v, u = np.mgrid[0:512, 0:512] / 512
    n = fbm((512, 512), 23, 3)
    rings = 0.5 + 0.5 * np.sin((v * 40 + n * 6) * math.pi)
    rgb = np.array([0.3, 0.13, 0.055])[None, None, :] * (0.7 + 0.45 * rings[..., None])
    return image_from_array("Wood_BaseColor", rgb), None


# --- materials -------------------------------------------------------------------------------

def material(name, color=(1, 1, 1), metallic=0.0, roughness=0.5, base_img=None, normal_img=None, rm_img=None, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if base_img:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = base_img
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if normal_img:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = normal_img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if rm_img:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = rm_img
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = 4.0
    return mat


# --- geometry --------------------------------------------------------------------------------

def finish(obj, name, mat, bevel=0.0, smooth=True):
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    if smooth:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
    return obj


def top_down_uv(obj, rx, rz, cz):
    """UVs from above, so the felt texture's betting line lands where it was painted."""
    me = obj.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="UVMap")
    for loop in me.loops:
        co = obj.matrix_world @ me.vertices[loop.vertex_index].co
        x, z = co.x, -co.y
        # Painted rows run from the back (z = -rz) at v = 0 to the front at v = 1.
        uv.data[loop.index].uv = ((x / rx) * 0.5 + 0.5, ((z - cz) / rz) * 0.5 + 0.5)


def oval_cylinder(name, rx, rz, depth, top_y, mat, verts=96, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=1, depth=depth, location=b(0, CENTER_Z, top_y - depth / 2))
    obj = bpy.context.active_object
    obj.scale = (rx, rz, 1)
    bpy.ops.object.transform_apply(scale=True)
    return finish(obj, name, mat, bevel)


def oval_torus(name, rx, rz, tube, y, mat, z=CENTER_Z, major_segments=128):
    bpy.ops.mesh.primitive_torus_add(major_segments=major_segments, minor_segments=16, major_radius=1, minor_radius=tube, location=b(0, z, y))
    obj = bpy.context.active_object
    obj.scale = (rx, rz, 1)
    bpy.ops.object.transform_apply(scale=True)
    return finish(obj, name, mat)


def seat_anchors():
    """12 seats round the front of the rail, 28 in two gallery rows behind them (40 in all)."""
    anchors = []
    rows = [(12, FELT_RX + 0.55, FELT_RZ + 0.55, 0.15, 0.9), (14, FELT_RX + 1.6, FELT_RZ + 1.5, 0.55, 0.95), (14, FELT_RX + 2.5, FELT_RZ + 2.3, 0.95, 0.98)]
    for count, rx, rz, y, spread in rows:
        for i in range(count):
            t = i / (count - 1)
            angle = (-0.5 + t) * math.pi * spread * 1.1
            anchors.append((math.sin(angle) * rx, y, math.cos(angle) * rz + CENTER_Z))
    for i, (x, y, z) in enumerate(anchors):
        bpy.ops.object.empty_add(type="PLAIN_AXES", location=b(x, z, y))
        bpy.context.active_object.name = f"Seat_Anchor_{i:02d}"


def build_table():
    clear()
    felt_c, felt_n = felt_textures()
    leather = leather_textures()
    wood_c, wood_n = wood_textures()
    m_felt = material("Felt", roughness=0.95, base_img=felt_c)
    m_leather = material("Leather", roughness=0.6, base_img=leather[0])
    m_brass = material("Brass", color=(0.83, 0.62, 0.26), metallic=1.0, roughness=0.32)
    m_wood = material("Wood", roughness=0.55, base_img=wood_c)
    m_tray = material("Tray", color=(0.05, 0.03, 0.02), roughness=0.4)

    felt = oval_cylinder("Table_Felt", FELT_RX, FELT_RZ, 0.08, 0.0, m_felt)
    top_down_uv(felt, FELT_RX, FELT_RZ, CENTER_Z)
    oval_torus("Table_Rail", FELT_RX + 0.12, FELT_RZ + 0.12, 0.13, 0.03, m_leather)
    oval_torus("Table_Trim", FELT_RX - 0.02, FELT_RZ - 0.02, 0.022, 0.01, m_brass)
    oval_cylinder("Table_Apron", FELT_RX + 0.05, FELT_RZ + 0.05, 0.55, -0.08, m_wood, bevel=0.02)
    oval_torus("Pot_Ring", 0.62, 0.62, 0.018, 0.006, m_brass, z=-0.35, major_segments=64)

    # Dealer station at the back: a chip tray with five slots.
    bpy.ops.mesh.primitive_cube_add(size=1, location=b(0, CENTER_Z - FELT_RZ + 0.55, 0.03))
    tray = bpy.context.active_object
    tray.scale = (1.3, 0.34, 0.07)
    bpy.ops.object.transform_apply(scale=True)
    finish(tray, "Dealer_Tray", m_tray, bevel=0.015, smooth=False)
    for i in range(5):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.1, depth=0.26, location=b(-0.52 + i * 0.26, CENTER_Z - FELT_RZ + 0.55, 0.075), rotation=(math.pi / 2, 0, 0))
        finish(bpy.context.active_object, f"Dealer_Tray_Slot_{i}", m_brass)
    seat_anchors()


def build_room():
    clear()
    m_floor = material("Floor", color=(0.018, 0.012, 0.022), roughness=0.9)
    m_wall = material("Wall", color=(0.012, 0.01, 0.012), roughness=0.95)
    m_shade = material("Shade", color=(0.06, 0.18, 0.1), metallic=0.3, roughness=0.4)
    m_bulb = material("Bulb", color=(1, 0.9, 0.7), emission=(1, 0.85, 0.6))
    bpy.ops.mesh.primitive_plane_add(size=1, location=b(0, 0, -0.65))
    floor = bpy.context.active_object
    floor.scale = (24, 18, 1)
    bpy.ops.object.transform_apply(scale=True)
    finish(floor, "Room_Floor", m_floor, smooth=False)
    # Four walls and no ceiling: the camera never looks up, and the lamps light the table.
    bm = bmesh.new()
    hx, hz, y0, y1 = 12.0, 9.0, -0.65, 6.0
    corners = [(-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)]
    for (x0, z0), (x1, z1) in zip(corners, corners[1:] + corners[:1]):
        verts = [bm.verts.new(b(x0, z0, y0)), bm.verts.new(b(x1, z1, y0)), bm.verts.new(b(x1, z1, y1)), bm.verts.new(b(x0, z0, y1))]
        bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])  # seen from inside
    me = bpy.data.meshes.new("Room_Walls")
    bm.to_mesh(me)
    bm.free()
    walls = bpy.data.objects.new("Room_Walls", me)
    bpy.context.scene.collection.objects.link(walls)
    walls.data.materials.append(m_wall)
    for side, x in (("L", -1.6), ("R", 1.6)):
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.55, radius2=0.12, depth=0.4, location=b(x, CENTER_Z, 3.4))
        finish(bpy.context.active_object, f"Lamp_Shade_{side}", m_shade)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11, location=b(x, CENTER_Z, 3.2))
        finish(bpy.context.active_object, f"Lamp_Bulb_{side}", m_bulb)


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_image_format="JPEG",
        export_image_quality=85,
        export_yup=True,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="public/models/")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    os.makedirs(args.out, exist_ok=True)
    build_table()
    export(os.path.join(args.out, "table.glb"))
    build_room()
    export(os.path.join(args.out, "room.glb"))
    for name in ("table.glb", "room.glb"):
        print(name, os.path.getsize(os.path.join(args.out, name)) // 1024, "KB")


if __name__ == "__main__":
    main()
