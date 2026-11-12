"""Builds the 3D character avatars with Blender (bpy) and renders sprite frames.

Each character is assembled from the same part list the old SVG avatars use
(ears, eyes, mouth, collar, face pattern, colours), so the 3D set matches the
characters students already know.

Output per character: one horizontal strip WebP with FRAMES frames
(<out>/<id>.webp at 256 px per frame and <out>/s/<id>.webp at 128 px):
  0 open eyes, 1 blink, 2 happy smile, 3 wink
Output per flair: flair_<id>.webp (same two sizes) (rendered over a hidden head so it sits in place).

Usage:
  npm run avatars          (exports the character list, then runs this script into public/avatars3d)
  python3 scripts/assets/build_avatars.py <chars.json> <out_dir> [id,id,...|flairs]
chars.json comes from scripts/assets/export_characters.ts.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

RES = 256
SAMPLES = 24
FRAMES = ['open', 'blink', 'happy', 'wink']
DARK = '#0f172a'


# ---------------------------------------------------------------- helpers
def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(hexstr, a=1.0):
    h = hexstr.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)


_mats = {}


def mat(hexstr, rough=0.45, emit=0.0, metal=0.0, coat=0.25):
    key = (hexstr, rough, emit, metal, coat)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f'm_{hexstr}_{len(_mats)}')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = rgba(hexstr)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for name in ('Coat Weight', 'Clearcoat'):
        if name in b.inputs:
            b.inputs[name].default_value = coat
            break
    if emit > 0:
        b.inputs['Emission Color'].default_value = rgba(hexstr)
        b.inputs['Emission Strength'].default_value = emit
    _mats[key] = m
    return m


class Rig:
    """Collects objects into named groups so frames can toggle them."""

    def __init__(self):
        self.root = bpy.data.objects.new('root', None)
        bpy.context.scene.collection.objects.link(self.root)
        self.groups = {}

    def add(self, obj, group='base'):
        obj.parent = self.root
        self.groups.setdefault(group, []).append(obj)
        return obj

    def show(self, visible_groups):
        for g, objs in self.groups.items():
            hide = not (g == 'base' or g in visible_groups)
            for o in objs:
                o.hide_render = hide


def _finish(obj, m, smooth=True, subdiv=0):
    obj.data.materials.append(m)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    if subdiv:
        mod = obj.modifiers.new('sub', 'SUBSURF')
        mod.levels = subdiv
        mod.render_levels = subdiv
    return obj


def sphere(loc, scale, m, rot=(0, 0, 0), seg=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, m)


def cone(loc, r1, r2, depth, m, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    return _finish(o, m, smooth=True)


def cyl(loc, r, depth, m, rot=(0, 0, 0), scale=(1, 1, 1), verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    o = _finish(o, m, smooth=True)
    bev = o.modifiers.new('bev', 'BEVEL')
    bev.width = min(r, depth) * 0.25
    bev.segments = 3
    return o


def box(loc, size, m, rot=(0, 0, 0), bevel=0.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    o = _finish(o, m, smooth=True)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        bv = o.modifiers.new('bev', 'BEVEL')
        bv.width = bevel
        bv.segments = 4
    return o


def torus(loc, R, r, m, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot,
                                     major_segments=64, minor_segments=16)
    o = bpy.context.active_object
    o.scale = scale
    return _finish(o, m)


def tube(points, radius, m, closed=False):
    """Smooth bevelled curve through points (list of xyz)."""
    cu = bpy.data.curves.new('tube', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, xyz in zip(sp.points, points):
        p.co = (*xyz, 1)
    sp.order_u = min(4, len(points))
    sp.use_endpoint_u = True
    sp.use_cyclic_u = closed
    o = bpy.data.objects.new('tube', cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def arc(cx, cz, w, h, y, n=7):
    """Points of an arc on the face plane y, from cx-w to cx+w, bulging by h."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        x = cx - w + 2 * w * t
        z = cz + h * (1 - (2 * t - 1) ** 2)
        pts.append((x, face_y(x, z) + y, z))
    return pts


# ---------------------------------------------------------------- head geometry
HEAD = Vector((0, 0, 0.35))
HEAD_S = Vector((1.12, 0.98, 0.98))


MUZZLE = Vector((0, -0.55, 0.05))
MUZZLE_S = Vector((0.62, 0.45, 0.42))


def _ell_front(c, s, x, z):
    nx = (x - c.x) / s.x
    nz = (z - c.z) / s.z
    d = 1 - nx * nx - nz * nz
    if d <= 0:
        return 0.0
    return c.y - s.y * math.sqrt(d)


def face_y(x, z):
    """Y of the front face surface (head + muzzle) at (x, z)."""
    return min(_ell_front(HEAD, HEAD_S, x, z), _ell_front(MUZZLE, MUZZLE_S, x, z))


def on_face(x, z, out=0.0):
    return (x, face_y(x, z) - out, z)


def face_rot(x, z):
    """Euler rotation that roughly faces the head normal at (x, z)."""
    nx = x / HEAD_S.x
    nz = (z - HEAD.z) / HEAD_S.z
    return (math.radians(90) - math.asin(max(-1, min(1, nz))) * 1.0 - math.radians(90) + 0, 0,
            math.asin(max(-1, min(1, nx))))


# ---------------------------------------------------------------- parts
EYE_X = 0.40
EYE_Z = 0.42


def build_head(rig, ch):
    P, S = ch['primaryColor'], ch['secondaryColor']
    rig.add(sphere(HEAD, HEAD_S, mat(P, 0.5)), 'base')
    # lower face / muzzle area
    rig.add(sphere(MUZZLE, MUZZLE_S, mat(S, 0.55)), 'base')


def build_ears(rig, ch):
    P, S, D = ch['primaryColor'], ch['secondaryColor'], ch['detailColor']
    st = ch['earStyle']
    for side in (-1, 1):
        if st in ('fox', 'cat'):
            tall = 0.95 if st == 'fox' else 0.7
            o = cone((side * 0.66, 0.05, 1.12), 0.42, 0.02, tall * 1.15, mat(P, 0.5),
                     rot=(math.radians(-6), math.radians(side * 22), 0), verts=4 if st == 'cat' else 24)
            o.scale = (1, 0.45, 1)
            rig.add(o)
            inner = cone((side * 0.66, -0.1, 1.08), 0.26, 0.01, tall * 0.85, mat(S if st == 'fox' else '#f9a8d4', 0.6),
                         rot=(math.radians(-6), math.radians(side * 22), 0), verts=4 if st == 'cat' else 24)
            inner.scale = (1, 0.3, 1)
            rig.add(inner)
        elif st == 'round':
            rig.add(sphere((side * 0.82, 0.08, 1.0), (0.34, 0.16, 0.34), mat(P, 0.5)))
            rig.add(sphere((side * 0.82, -0.04, 1.0), (0.2, 0.08, 0.2), mat(S, 0.6)))
        elif st == 'floppy':
            rig.add(sphere((side * 1.08, -0.05, 0.45), (0.22, 0.14, 0.52), mat(D, 0.6),
                           rot=(0, math.radians(side * -18), 0)))
        elif st == 'bunny':
            rig.add(sphere((side * 0.36, 0.05, 1.55), (0.2, 0.12, 0.62), mat(P, 0.5),
                           rot=(0, math.radians(side * 10), 0)))
            rig.add(sphere((side * 0.36, -0.04, 1.55), (0.11, 0.06, 0.48), mat(S, 0.6),
                           rot=(0, math.radians(side * 10), 0)))
        elif st == 'horns':
            pts = [(side * 0.55, 0.05, 1.05), (side * 0.85, 0.0, 1.35), (side * 0.8, -0.05, 1.62)]
            o = tube(pts, 0.13, mat(D, 0.35, metal=0.2))
            o.data.taper_object = None
            rig.add(o)
            rig.add(cone((side * 0.8, -0.05, 1.68), 0.1, 0.0, 0.25, mat(D, 0.35, metal=0.2)))
        elif st == 'antenna':
            if side == 1:
                rig.add(tube([(0, 0, 1.25), (0.05, 0, 1.5), (0.0, 0, 1.68)], 0.04, mat('#94a3b8', 0.3, metal=0.8)))
                rig.add(sphere((0, 0, 1.72), (0.13, 0.13, 0.13), mat(D, 0.2, emit=3.0)))
            rig.add(cyl((side * 1.1, 0.0, 0.4), 0.2, 0.18, mat('#334155', 0.3, metal=0.6),
                        rot=(0, math.radians(90), 0)))
            rig.add(cyl((side * 1.2, 0.0, 0.4), 0.11, 0.06, mat(D, 0.2, emit=2.0),
                        rot=(0, math.radians(90), 0)))
        elif st == 'fins':
            o = cone((side * 1.12, 0.05, 0.5), 0.32, 0.02, 0.55, mat(D, 0.4),
                     rot=(0, math.radians(side * 70), 0), verts=3)
            o.scale = (1, 0.35, 1)
            rig.add(o)
        elif st == 'feathers':
            if side == 1:
                for i, (x, ang, h) in enumerate([(-0.18, -18, 0.55), (0, 0, 0.7), (0.18, 18, 0.55)]):
                    rig.add(sphere((x, 0.0, 1.32 + h * 0.3), (0.1, 0.07, h * 0.5), mat(D, 0.45),
                                   rot=(0, math.radians(ang), 0)))


def _eye_white(rig, x, z, group, r=0.17):
    rig.add(sphere(on_face(x, z, -0.04), (r, 0.09, r * 1.12), mat('#ffffff', 0.25)), group)


def _pupil(rig, x, z, r, group, hl=True, iris=None, sparkle=False):
    rig.add(sphere(on_face(x, z, 0.02), (r, 0.07, r * 1.15), mat(DARK, 0.2)), group)
    if iris:
        rig.add(sphere(on_face(x, z, 0.05), (r * 0.55, 0.05, r * 0.6), mat(iris, 0.2, emit=0.5)), group)
    if hl:
        rig.add(sphere(on_face(x + r * 0.35, z + r * 0.4, 0.09), (r * 0.32, 0.03, r * 0.32),
                       mat('#ffffff', 0.1, emit=1.5)), group)
    if sparkle:
        rig.add(sphere(on_face(x - r * 0.35, z - r * 0.4, 0.09), (r * 0.16, 0.03, r * 0.16),
                       mat('#ffffff', 0.1, emit=1.5)), group)


def _closed_eye(rig, x, z, group, happy=False):
    h = 0.09 if happy else -0.06
    rig.add(tube(arc(x, z - (0.0 if happy else 0.02), 0.14, h, -0.03), 0.032, mat(DARK, 0.3)), group)


def build_eyes(rig, ch):
    st, D = ch['eyeStyle'], ch['detailColor']
    tech = st in ('visor', 'robo')
    for side in (-1, 1):
        x = side * EYE_X
        right_wink = side == 1
        if tech:
            continue
        # open eyes appear in "open", "happy"(for non-tech we use arcs), "wink" (left eye)
        groups_open = ['eyes_open']
        if not right_wink:
            groups_open.append('eyes_wink')
        for g in groups_open:
            if ch['facePattern'] == 'mask' and st != 'wise':
                _eye_white(rig, x, EYE_Z, g, 0.165)
            if st == 'wise':
                _eye_white(rig, x, EYE_Z, g, 0.2)
                _pupil(rig, x, EYE_Z, 0.1, g)
            elif st == 'sparkle':
                _pupil(rig, x, EYE_Z, 0.14, g, sparkle=True)
            elif st == 'fierce':
                _pupil(rig, x, EYE_Z - 0.02, 0.12, g, iris='#fde047')
            elif st == 'cool':
                o = _pupil(rig, x, EYE_Z, 0.125, g)
            else:  # confident, happy
                _pupil(rig, x, EYE_Z, 0.12, g)
        _closed_eye(rig, x, EYE_Z, 'eyes_blink')
        _closed_eye(rig, x, EYE_Z, 'eyes_happy', happy=True)
        if right_wink:
            _closed_eye(rig, x, EYE_Z, 'eyes_wink', happy=True)
        # brows / lids
        if st in ('confident', 'cool', 'fierce'):
            if st == 'fierce':
                pts = [on_face(side * 0.58, EYE_Z + 0.22, 0.03), on_face(side * 0.42, EYE_Z + 0.19, 0.03),
                       on_face(side * 0.24, EYE_Z + 0.12, 0.03)]
            elif st == 'cool':
                pts = [on_face(side * 0.56, EYE_Z + 0.2, 0.03), on_face(side * 0.40, EYE_Z + 0.21, 0.03),
                       on_face(side * 0.25, EYE_Z + 0.2, 0.03)]
            else:
                pts = [on_face(side * 0.56, EYE_Z + 0.2, 0.03), on_face(side * 0.40, EYE_Z + 0.26, 0.03),
                       on_face(side * 0.25, EYE_Z + 0.21, 0.03)]
            rig.add(tube(pts, 0.035, mat(DARK, 0.4)), 'base')
        if st == 'wise':
            g = mat('#fbbf24', 0.2, metal=0.9)
            ring = torus(on_face(x, EYE_Z, 0.06), 0.21, 0.025, g, rot=(math.radians(90), 0, side * 0.35))
            rig.add(ring, 'base')
    if st == 'wise':
        rig.add(tube([on_face(-0.19, EYE_Z + 0.02, 0.08), on_face(0, EYE_Z + 0.06, 0.08),
                      on_face(0.19, EYE_Z + 0.02, 0.08)], 0.022, mat('#fbbf24', 0.2, metal=0.9)), 'base')
    if tech:
        # dark band across the eyes, glowing lights that dim on blink
        band = box(on_face(0, EYE_Z, 0.03), (1.15, 0.3, 0.34), mat(DARK, 0.15, coat=0.8),
                   bevel=0.12)
        band.rotation_euler = (0, 0, 0)
        rig.add(band, 'base')
        glow = mat(D, 0.2, emit=4.0)
        if st == 'robo':
            for side in (-1, 1):
                rig.add(sphere(on_face(side * 0.32, EYE_Z, 0.21), (0.11, 0.04, 0.11), glow), 'eyes_open')
                rig.add(sphere(on_face(side * 0.32, EYE_Z, 0.21), (0.12, 0.03, 0.025), glow), 'eyes_blink')
                rig.add(tube(arc(side * 0.32, EYE_Z - 0.04, 0.1, 0.08, -0.22), 0.03, glow), 'eyes_happy')
            rig.add(sphere(on_face(-0.32, EYE_Z, 0.21), (0.11, 0.04, 0.11), glow), 'eyes_wink')
            rig.add(tube(arc(0.32, EYE_Z - 0.04, 0.1, 0.08, -0.22), 0.03, glow), 'eyes_wink')
        else:  # visor
            rig.add(tube([on_face(x_, EYE_Z + 0.03, 0.2) for x_ in (-0.4, -0.25, -0.1)], 0.035, glow), 'eyes_open')
            rig.add(sphere(on_face(0.3, EYE_Z, 0.2), (0.07, 0.03, 0.07), glow), 'eyes_open')
            rig.add(tube([on_face(x_, EYE_Z, 0.2) for x_ in (-0.4, 0, 0.4)], 0.018, glow), 'eyes_blink')
            rig.add(tube(arc(-0.25, EYE_Z - 0.03, 0.12, 0.07, -0.2), 0.03, glow), 'eyes_happy')
            rig.add(tube(arc(0.25, EYE_Z - 0.03, 0.12, 0.07, -0.2), 0.03, glow), 'eyes_happy')
            rig.add(tube([on_face(x_, EYE_Z + 0.03, 0.2) for x_ in (-0.4, -0.25, -0.1)], 0.035, glow), 'eyes_wink')
            rig.add(tube(arc(0.25, EYE_Z - 0.03, 0.12, 0.07, -0.2), 0.03, glow), 'eyes_wink')


MOUTH_Z = -0.02


def build_mouth(rig, ch):
    st, D, S = ch['mouthStyle'], ch['detailColor'], ch['secondaryColor']
    dark = mat(DARK, 0.35)
    happy_mouth = [on_face(x, MOUTH_Z + 0.1 * (1 - (x / 0.24) ** 2) * -1 + 0.02, 0.0) for x in
                   (-0.24, -0.16, -0.08, 0, 0.08, 0.16, 0.24)]

    def open_smile(group, z=MOUTH_Z - 0.03, w=0.2):
        o = sphere(on_face(0, z, -0.04), (w, 0.08, w * 0.6), mat('#7f1d1d', 0.4))
        rig.add(o, group)
        rig.add(sphere(on_face(0, z - w * 0.25, 0.0), (w * 0.55, 0.05, w * 0.25), mat('#f87171', 0.5)), group)
        rig.add(box(on_face(0, z + w * 0.42, 0.02), (w * 1.4, 0.04, w * 0.25), mat('#ffffff', 0.3), bevel=0.02), group)

    if st in ('snout', 'whiskers'):
        nose_col = DARK if st == 'snout' else '#f43f5e'
        rig.add(sphere(on_face(0, MOUTH_Z + 0.2, 0.06), (0.13, 0.09, 0.09), mat(nose_col, 0.15, coat=0.8)))
    if st == 'whiskers':
        for side in (-1, 1):
            for dz in (0.03, -0.06):
                rig.add(tube([on_face(side * 0.32, MOUTH_Z + 0.1 + dz, 0.02),
                              on_face(side * 0.62, MOUTH_Z + 0.13 + dz * 1.6, -0.08)], 0.012, mat('#334155', 0.4)))
    if st == 'beak':
        for g, open_ in (('mouth_neutral', False), ('mouth_happy', True)):
            top = cone(on_face(0, MOUTH_Z + 0.1, 0.12), 0.17, 0.0, 0.32, mat('#f59e0b', 0.35),
                       rot=(math.radians(90 + (8 if open_ else 0)), 0, 0))
            top.scale = (1.25, 1, 0.7)
            rig.add(top, g)
            if open_:
                bot = cone(on_face(0, MOUTH_Z - 0.04, 0.07), 0.12, 0.0, 0.2, mat('#d97706', 0.35),
                           rot=(math.radians(70), 0, 0))
                bot.scale = (1.2, 1, 0.6)
                rig.add(bot, g)
        return
    if st == 'mustache':
        for side in (-1, 1):
            rig.add(sphere(on_face(side * 0.15, MOUTH_Z + 0.06, 0.06), (0.19, 0.08, 0.08), mat('#1e293b', 0.6),
                           rot=(0, math.radians(side * 15), 0)))
            rig.add(sphere(on_face(side * 0.32, MOUTH_Z + 0.1, 0.02), (0.08, 0.06, 0.06), mat('#1e293b', 0.6)))
        rig.add(tube(arc(0, MOUTH_Z - 0.1, 0.1, -0.03, 0.0, 5), 0.025, dark), 'mouth_neutral')
        open_smile('mouth_happy', MOUTH_Z - 0.12, 0.13)
        return
    if st == 'robo_grille':
        rig.add(box(on_face(0, MOUTH_Z, 0.0), (0.5, 0.12, 0.16), mat(DARK, 0.2), bevel=0.05), 'base')
        for i, x in enumerate((-0.12, 0, 0.12)):
            rig.add(box(on_face(x, MOUTH_Z, 0.06), (0.03, 0.04, 0.12), mat(ch['detailColor'], 0.2, emit=3.0), bevel=0.01),
                    'mouth_neutral')
        rig.add(tube(arc(0, MOUTH_Z - 0.03, 0.18, -0.06, -0.07), 0.025, mat(ch['detailColor'], 0.2, emit=3.0)),
                'mouth_happy')
        return
    # line mouths
    if st == 'smirk':
        pts = [on_face(-0.16, MOUTH_Z - 0.02), on_face(0.0, MOUTH_Z - 0.06), on_face(0.18, MOUTH_Z + 0.04)]
        rig.add(tube(pts, 0.03, dark), 'mouth_neutral')
    elif st == 'grin':
        open_smile('mouth_neutral', MOUTH_Z - 0.02, 0.17)
    elif st == 'fangs':
        rig.add(tube(arc(0, MOUTH_Z - 0.02, 0.22, -0.06, 0.0), 0.03, dark), 'mouth_neutral')
        for side in (-1, 1):
            rig.add(cone(on_face(side * 0.13, MOUTH_Z - 0.08, 0.02), 0.045, 0.0, 0.12, mat('#ffffff', 0.3),
                         rot=(math.radians(180), 0, 0)), 'mouth_neutral')
    elif st in ('snout', 'whiskers'):
        rig.add(tube(arc(0, MOUTH_Z, 0.14, -0.06, 0.0, 5), 0.028, dark), 'mouth_neutral')
    open_smile('mouth_happy')
    if st == 'fangs':
        for side in (-1, 1):
            rig.add(cone(on_face(side * 0.11, MOUTH_Z + 0.02, 0.04), 0.04, 0.0, 0.1, mat('#ffffff', 0.3),
                         rot=(math.radians(180), 0, 0)), 'mouth_happy')


def build_pattern(rig, ch):
    st, D, S = ch['facePattern'], ch['detailColor'], ch['secondaryColor']
    if st == 'blush':
        for side in (-1, 1):
            rig.add(sphere(on_face(side * 0.6, 0.12, 0.0), (0.13, 0.04, 0.08), mat('#fb7185', 0.6),
                           rot=(0, 0, side * 0.6)))
    elif st == 'freckles':
        for side in (-1, 1):
            for dx, dz in ((0, 0), (0.09, -0.05), (0.07, 0.06)):
                rig.add(sphere(on_face(side * (0.58 + dx), 0.14 + dz, 0.0), (0.03, 0.02, 0.03), mat(D, 0.5)))
    elif st == 'stripes':
        for x, h in ((-0.12, 0.17), (0, 0.24), (0.12, 0.17)):
            rig.add(tube([on_face(x * 1.3, 0.97 - h, 0.0), on_face(x * 1.3, 0.97, 0.0)], 0.026, mat(D, 0.5)))
    elif st == 'mask':
        shell = sphere(HEAD, (HEAD_S.x * 1.015, HEAD_S.y * 1.03, HEAD_S.z * 1.015), mat('#1e293b', 0.5))
        cutter = box((0, -0.6, EYE_Z - 0.01), (2.6, 1.4, 0.34), mat('#000000'), bevel=0)
        cutter.hide_render = True
        cutter.hide_viewport = True
        bo = shell.modifiers.new('band', 'BOOLEAN')
        bo.operation = 'INTERSECT'
        bo.object = cutter
        rig.add(shell)
    elif st == 'patch':
        rig.add(sphere(on_face(-EYE_X, EYE_Z, -0.05), (0.25, 0.1, 0.23), mat(S, 0.55)))
    elif st == 'scales':
        for x, z in ((0, 0.92), (-0.14, 0.84), (0.14, 0.84)):
            o = cone(on_face(x, z, 0.0), 0.07, 0.0, 0.05, mat(D, 0.35), rot=(math.radians(90), 0, 0), verts=3)
            o.rotation_euler = (math.radians(90), math.radians(180), 0)
            rig.add(o)
    elif st == 'circuit':
        glow = mat(D, 0.2, emit=3.0)
        for side in (-1, 1):
            pts = [on_face(side * 0.78, 0.66, 0.0), on_face(side * 0.6, 0.66, 0.0), on_face(side * 0.5, 0.78, 0.0)]
            rig.add(tube(pts, 0.018, glow))
            rig.add(sphere(on_face(side * 0.5, 0.79, 0.01), (0.035, 0.02, 0.035), glow))


def build_body(rig, ch):
    P, S, D = ch['primaryColor'], ch['secondaryColor'], ch['detailColor']
    st = ch['collarStyle']
    body_z = -0.95
    base_col = {'tuxedo': '#1e293b', 'royal_robe': D, 'cape': '#311042', 'cyber_armor': '#0f172a',
                'hoodie': D, 'scarf': P, 'none': P}.get(st, P)
    rig.add(sphere((0, 0.1, body_z), (0.95, 0.72, 0.62), mat(base_col, 0.5 if st != 'cyber_armor' else 0.25,
                                                             metal=0.4 if st == 'cyber_armor' else 0)))
    if st == 'tuxedo':
        rig.add(cone((0, -0.52, -0.7), 0.2, 0.0, 0.5, mat('#f8fafc', 0.5), rot=(0, math.radians(180), 0), verts=3))
        for side in (-1, 1):
            o = cone((side * 0.1, -0.68, -0.48), 0.12, 0.0, 0.22, mat(D, 0.35), rot=(0, math.radians(-90 * side), 0), verts=24)
            o.scale = (1, 0.6, 1)
            rig.add(o)
        rig.add(sphere((0, -0.72, -0.48), (0.06, 0.05, 0.06), mat(D, 0.3)))
    elif st == 'royal_robe':
        rig.add(torus((0, 0.05, -0.55), 0.62, 0.11, mat('#ffffff', 0.85), scale=(1.15, 0.85, 0.7)))
        rig.add(sphere((0, -0.68, -0.72), (0.09, 0.05, 0.09), mat('#fbbf24', 0.2, metal=0.9)))
    elif st == 'cape':
        rig.add(torus((0, 0.05, -0.55), 0.6, 0.07, mat(D, 0.45), scale=(1.15, 0.85, 0.6)))
        rig.add(sphere((0, -0.66, -0.62), (0.09, 0.05, 0.09), mat('#fde047', 0.2, metal=0.9)))
    elif st == 'cyber_armor':
        glow = mat(D, 0.2, emit=3.5)
        rig.add(tube([(-0.45, -0.62, -0.95), (0, -0.7, -0.9), (0.45, -0.62, -0.95)], 0.025, glow))
        for side in (-1, 1):
            rig.add(sphere((side * 0.82, 0.05, -0.75), (0.3, 0.3, 0.2), mat('#334155', 0.25, metal=0.6)))
    elif st == 'hoodie':
        rig.add(torus((0, 0.15, -0.5), 0.7, 0.16, mat(D, 0.65), scale=(1.15, 0.9, 0.7)))
        for side in (-1, 1):
            rig.add(tube([(side * 0.12, -0.7, -0.6), (side * 0.14, -0.72, -0.85)], 0.02, mat('#f8fafc', 0.5)))
    elif st == 'scarf':
        rig.add(torus((0, 0.05, -0.55), 0.6, 0.15, mat(D, 0.7), scale=(1.15, 0.9, 0.6)))
        rig.add(sphere((0.35, -0.6, -0.85), (0.14, 0.08, 0.28), mat(D, 0.7), rot=(0, 0.3, 0)))


FLAIR_IDS = ['crown', 'shades', 'tophat', 'halo', 'wizard', 'headset', 'horns']


def build_flair(rig, flair):
    gold = mat('#fbbf24', 0.2, metal=1.0)
    if flair == 'crown':
        rig.add(cyl((0, 0.05, 1.28), 0.42, 0.2, gold))
        for i in range(5):
            a = math.radians(-90 + (i - 2) * 36)
            x, y = 0.4 * math.cos(a), 0.05 + 0.4 * math.sin(a)
            rig.add(cone((x, y, 1.5), 0.1, 0.0, 0.3, gold))
            rig.add(sphere((x, y, 1.66), (0.05, 0.05, 0.05), gold))
        rig.add(sphere((0, -0.33, 1.28), (0.07, 0.04, 0.07), mat('#e11d48', 0.05, coat=1)))
    elif flair == 'tophat':
        blk = mat('#111827', 0.35, coat=0.6)
        rig.add(cyl((0, 0.05, 1.27), 0.62, 0.06, blk, rot=(math.radians(-6), 0, 0)))
        rig.add(cyl((0, 0.08, 1.6), 0.4, 0.66, blk, rot=(math.radians(-6), 0, 0)))
        rig.add(cyl((0, 0.06, 1.38), 0.412, 0.12, mat('#dc2626', 0.5), rot=(math.radians(-6), 0, 0)))
    elif flair == 'shades':
        lens = mat('#020617', 0.05, coat=1.0)
        for side in (-1, 1):
            rig.add(box(on_face(side * 0.36, EYE_Z, 0.16), (0.36, 0.06, 0.24), lens, rot=(0, 0, side * 0.3), bevel=0.08))
        rig.add(tube([on_face(-0.18, EYE_Z + 0.06, 0.17), on_face(0, EYE_Z + 0.09, 0.2),
                      on_face(0.18, EYE_Z + 0.06, 0.17)], 0.025, lens))
        rig.add(tube([on_face(-0.5, EYE_Z + 0.06, 0.12), (-0.98, 0.05, EYE_Z + 0.4)], 0.02, lens))
        rig.add(tube([on_face(0.5, EYE_Z + 0.06, 0.12), (0.98, 0.05, EYE_Z + 0.4)], 0.02, lens))
        rig.add(box(on_face(-0.43, EYE_Z + 0.06, 0.2), (0.1, 0.02, 0.03), mat('#ffffff', 0.1, emit=2), bevel=0.01))
    elif flair == 'halo':
        rig.add(torus((0, 0.1, 1.62), 0.5, 0.06, mat('#fde047', 0.2, emit=2.5), rot=(math.radians(-14), 0, 0)))
    elif flair == 'wizard':
        purple = mat('#6d28d9', 0.6)
        rig.add(cyl((0, 0.05, 1.22), 0.72, 0.06, purple, rot=(math.radians(-8), 0, 0)))
        rig.add(tube([(0, 0.08, 1.2), (0.05, 0.1, 1.7), (0.35, 0.15, 2.05)], 0.0, purple))
        c = cone((0, 0.08, 1.6), 0.5, 0.04, 0.85, purple, rot=(math.radians(-8), math.radians(14), 0))
        rig.add(c)
        rig.add(sphere((0.12, -0.33, 1.45), (0.07, 0.03, 0.07), mat('#fde047', 0.2, emit=3)))
    elif flair == 'headset':
        m = mat('#1f2937', 0.35)
        pts = [(-1.16, -0.05, 0.45), (-1.05, -0.05, 1.1), (0, -0.05, 1.52), (1.05, -0.05, 1.1), (1.16, -0.05, 0.45)]
        rig.add(tube(pts, 0.06, m))
        for side in (-1, 1):
            rig.add(cyl((side * 1.18, -0.05, 0.42), 0.26, 0.18, m, rot=(0, math.radians(90), 0)))
            rig.add(cyl((side * 1.28, -0.05, 0.42), 0.14, 0.03, mat('#22d3ee', 0.2, emit=3), rot=(0, math.radians(90), 0)))
        rig.add(tube([(-1.1, -0.15, 0.32), (-0.85, -0.6, 0.0), (-0.35, -0.85, -0.05)], 0.025, m))
        rig.add(sphere((-0.33, -0.86, -0.05), (0.06, 0.06, 0.06), m))
    elif flair == 'horns':
        red = mat('#dc2626', 0.3, coat=0.6)
        for side in (-1, 1):
            rig.add(tube([(side * 0.42, -0.1, 1.1), (side * 0.55, -0.15, 1.35), (side * 0.48, -0.2, 1.55)], 0.1, red))
            rig.add(cone((side * 0.47, -0.21, 1.6), 0.08, 0.0, 0.18, red, rot=(math.radians(-15), 0, 0)))


# ---------------------------------------------------------------- scene
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.55, 0.6, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sc.world = world

    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 70
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    cam.location = (0, -6.3, 0.42)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    # 70mm on 36mm sensor at 8 units -> visible half width ~2.06

    def light(name, kind, loc, energy, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo)
        lo.location = loc
        d = Vector((0, 0, 0.3)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

    light('key', 'AREA', (-3.5, -5, 4.5), 700, 4)
    light('fill', 'AREA', (4, -4, 1), 220, 5, (0.85, 0.9, 1.0))
    light('rim', 'AREA', (2.5, 4, 4), 600, 3, (1.0, 0.92, 0.8))


def save_webp(img, out_base):
    """Writes <dir>/<name>.webp (256 px frames) and <dir>/s/<name>.webp (128 px frames)."""
    sc = bpy.context.scene
    st = sc.render.image_settings
    st.file_format = 'WEBP'
    st.color_mode = 'RGBA'
    st.quality = 82
    d, name = os.path.split(out_base)
    img.save_render(os.path.join(d, name + '.webp'), scene=sc)
    w, h = img.size
    img.scale(w // 2, h // 2)
    os.makedirs(os.path.join(d, 's'), exist_ok=True)
    img.save_render(os.path.join(d, 's', name + '.webp'), scene=sc)
    st.file_format = 'PNG'


def render_strip(rig, out_base, turn):
    sc = bpy.context.scene
    rig.root.rotation_euler = (0, 0, math.radians(turn))
    tmp = []
    combos = {
        'open': ['eyes_open', 'mouth_neutral'],
        'blink': ['eyes_blink', 'mouth_neutral'],
        'happy': ['eyes_happy', 'mouth_happy'],
        'wink': ['eyes_wink', 'mouth_happy'],
    }
    for f in FRAMES:
        rig.show(combos[f])
        p = out_base + f'.{f}.png'
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        tmp.append(p)
    # stitch frames into a horizontal strip
    imgs = [bpy.data.images.load(p) for p in tmp]
    w, h = imgs[0].size
    strip = bpy.data.images.new('strip', w * len(imgs), h, alpha=True)
    px = [0.0] * (w * len(imgs) * h * 4)
    for i, im in enumerate(imgs):
        src = list(im.pixels)
        for row in range(h):
            dst = (row * w * len(imgs) + i * w) * 4
            px[dst:dst + w * 4] = src[row * w * 4:(row + 1) * w * 4]
    strip.pixels = px
    save_webp(strip, out_base)
    for p in tmp:
        os.remove(p)


def build_character(ch, out_dir):
    reset_scene()
    rig = Rig()
    build_body(rig, ch)
    build_head(rig, ch)
    build_ears(rig, ch)
    build_pattern(rig, ch)
    build_eyes(rig, ch)
    build_mouth(rig, ch)
    render_strip(rig, os.path.join(out_dir, ch['id']), turn=-12)


def build_flair_sprite(flair, out_dir):
    reset_scene()
    rig = Rig()
    hold = [sphere(HEAD, HEAD_S, mat('#808080')), sphere((0, 0.1, -0.95), (0.95, 0.72, 0.62), mat('#808080'))]
    for o in hold:
        o.is_holdout = True
        rig.add(o)
    build_flair(rig, flair)
    rig.root.rotation_euler = (0, 0, math.radians(-12))
    sc = bpy.context.scene
    tmp = os.path.join(out_dir, f'flair_{flair}.tmp.png')
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp)
    img.pixels = list(img.pixels)  # detach from the file so scaling works
    save_webp(img, os.path.join(out_dir, f'flair_{flair}'))
    os.remove(tmp)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    data = json.load(open(args[0]))
    out_dir = args[1]
    only = set(args[2].split(',')) if len(args) > 2 and args[2] else None
    os.makedirs(out_dir, exist_ok=True)
    for ch in data['chars']:
        if only and ch['id'] not in only:
            continue
        build_character(ch, out_dir)
        print('built', ch['id'], flush=True)
    if not only or 'flairs' in only:
        for f in FLAIR_IDS:
            build_flair_sprite(f, out_dir)
            print('built flair', f, flush=True)


if __name__ == '__main__':
    main()
