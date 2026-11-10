"""
Grammar Casino — Headless Blender 3D Prop Generator (Enhanced PBR + Animations)
===============================================================================
Run in Antigravity (or terminal) via:
    blender --background --python scripts/assets/blender_generate_props.py

Generates and exports 4 low-poly, PBR-ready glTF (.glb) assets into `public/models/`:
  1. public/models/poker_chips.glb      (5 beveled clay casino chips: $10, $25, $50, $100, $500 with edge-spots & brass inlay)
  2. public/models/card_shoe.glb        (Mahogany & brushed brass dealer shoe + animated PowerUpCard with `CardDrawSlide` action)
  3. public/models/wheel_of_fortune.glb (20-wedge casino wheel, 20 brass rim studs, top hinged leather flapper)
  4. public/models/powerup_totems.glb   (3D table totems: Totem_ShieldDome, Totem_SubZeroIce, Totem_Boomerang, Totem_StreakCrown)
"""

import os
import math
import bpy

OUTPUT_DIR = os.path.join(os.getcwd(), "public", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_pbr_material(
    name,
    base_color,
    metallic=0.0,
    roughness=0.4,
    emission=None,
    emission_strength=0.0,
    alpha=1.0,
    transmission=0.0,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = (*emission, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
        if transmission > 0.0:
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = transmission
            elif "Transmission" in bsdf.inputs:
                bsdf.inputs["Transmission"].default_value = transmission
        if alpha < 1.0 and "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
            if hasattr(mat, "blend_method"):
                mat.blend_method = "BLEND"
    return mat


def add_bevel(obj, width=0.02, segments=3):
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def export_glb(filename, export_animations=False):
    filepath = os.path.join(OUTPUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=export_animations,
    )
    print(f"[Grammar Casino Blender] Exported: {filepath}")


# ---------------------------------------------------------------------------
# 1. POKER CHIPS ($10 Blue, $25 Green, $50 Red, $100 Black/Gold, $500 Purple)
#    Includes 8 circumferential ivory/gold edge-spots & center decal medallion
# ---------------------------------------------------------------------------
def build_poker_chips():
    clear_scene()
    chip_specs = [
        ("Chip_10",  (0.11, 0.36, 0.82), (0.95, 0.96, 0.98), -2.4),
        ("Chip_25",  (0.08, 0.58, 0.32), (0.95, 0.96, 0.98), -1.2),
        ("Chip_50",  (0.82, 0.14, 0.16), (0.95, 0.96, 0.98),  0.0),
        ("Chip_100", (0.12, 0.12, 0.14), (0.92, 0.74, 0.25),  1.2),
        ("Chip_500", (0.48, 0.18, 0.78), (0.95, 0.78, 0.28),  2.4),
    ]
    brass_inlay = make_pbr_material("BrassInlay", (0.88, 0.69, 0.24), metallic=0.85, roughness=0.25)

    for name, rgb, spot_rgb, x_pos in chip_specs:
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.45, depth=0.09, location=(x_pos, 0, 0.045))
        chip = bpy.context.active_object
        chip.name = name
        add_bevel(chip, width=0.012, segments=3)
        clay_mat = make_pbr_material(f"{name}_Clay", rgb, metallic=0.05, roughness=0.55)
        chip.data.materials.append(clay_mat)

        # Recessed inner brass ring
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.30,
            minor_radius=0.016,
            location=(x_pos, 0, 0.045),
        )
        ring = bpy.context.active_object
        ring.name = f"{name}_Ring"
        ring.scale = (1.0, 1.0, 3.1)
        bpy.ops.object.transform_apply(scale=True)
        ring.data.materials.append(brass_inlay)

        # Center denomination medallion disc
        spot_mat = make_pbr_material(f"{name}_Spot", spot_rgb, metallic=0.15, roughness=0.38)
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.22, depth=0.094, location=(x_pos, 0, 0.045))
        medallion = bpy.context.active_object
        medallion.name = f"{name}_Medallion"
        medallion.data.materials.append(spot_mat)

        # 6 circumferential edge-spot blocks joined directly into the chip mesh
        spot_objs = [chip, ring, medallion]
        for s_idx in range(6):
            ang = math.radians(s_idx * 60.0)
            sx = x_pos + 0.415 * math.cos(ang)
            sy = 0.415 * math.sin(ang)
            bpy.ops.mesh.primitive_cube_add(
                size=1.0,
                location=(sx, sy, 0.045),
                rotation=(0, 0, ang),
            )
            spot = bpy.context.active_object
            spot.scale = (0.08, 0.09, 0.092)
            bpy.ops.object.transform_apply(scale=True)
            spot.data.materials.append(spot_mat)
            spot_objs.append(spot)

        bpy.ops.object.select_all(action="DESELECT")
        for o in spot_objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = chip
        bpy.ops.object.join()

    export_glb("poker_chips.glb")


# ---------------------------------------------------------------------------
# 2. DEALER CARD SHOE & ANIMATED POWER-UP FOIL CARD (`CardDrawSlide`)
# ---------------------------------------------------------------------------
def build_card_shoe():
    clear_scene()
    mahogany = make_pbr_material("MahoganyWood", (0.24, 0.08, 0.05), metallic=0.05, roughness=0.28)
    brass = make_pbr_material("BrushedBrass", (0.85, 0.68, 0.24), metallic=0.9, roughness=0.22)
    gold_foil = make_pbr_material(
        "PowerUpFoil", (0.95, 0.76, 0.26), metallic=0.88, roughness=0.16,
        emission=(0.95, 0.72, 0.18), emission_strength=0.25
    )

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.35))
    shoe = bpy.context.active_object
    shoe.name = "DealerCardShoe"
    shoe.scale = (0.7, 1.35, 0.42)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(shoe, width=0.03, segments=3)
    shoe.data.materials.append(mahogany)

    # Brass front lip
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.68, 0.16))
    lip = bpy.context.active_object
    lip.name = "ShoeBrassLip"
    lip.scale = (0.74, 0.08, 0.12)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(lip, width=0.015, segments=2)
    lip.data.materials.append(brass)
    lip.parent = shoe

    # Power-up card emerging from front slot with keyframed `CardDrawSlide` animation
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.62, 0.30), rotation=(math.radians(22), 0, 0))
    card = bpy.context.active_object
    card.name = "PowerUpCard"
    card.scale = (0.48, 0.72, 0.012)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(card, width=0.004, segments=2)
    card.data.materials.append(gold_foil)

    # Keyframe Action: CardDrawSlide (Frames 1 -> 45)
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 45
    card.animation_data_create()
    action = bpy.data.actions.new(name="CardDrawSlide")
    card.animation_data.action = action

    # Frame 1: Nestled inside shoe
    bpy.context.scene.frame_set(1)
    card.location = (0.0, -0.58, 0.31)
    card.rotation_euler = (math.radians(22), 0.0, 0.0)
    card.keyframe_insert(data_path="location", frame=1)
    card.keyframe_insert(data_path="rotation_euler", frame=1)

    # Frame 24: Slides forward out of the brass lip
    bpy.context.scene.frame_set(24)
    card.location = (0.0, -1.12, 0.44)
    card.rotation_euler = (math.radians(40), math.radians(90), 0.0)
    card.keyframe_insert(data_path="location", frame=24)
    card.keyframe_insert(data_path="rotation_euler", frame=24)

    # Frame 45: Flips 180 degrees to face camera and hovers
    bpy.context.scene.frame_set(45)
    card.location = (0.0, -1.35, 0.62)
    card.rotation_euler = (math.radians(72), math.radians(180), 0.0)
    card.keyframe_insert(data_path="location", frame=45)
    card.keyframe_insert(data_path="rotation_euler", frame=45)

    bpy.context.scene.frame_set(1)
    export_glb("card_shoe.glb", export_animations=True)


# ---------------------------------------------------------------------------
# 3. 20-WEDGE CASINO WHEEL OF FORTUNE + 20 BRASS STUDS + TOP FLAPPER
# ---------------------------------------------------------------------------
def build_wheel_of_fortune():
    clear_scene()
    brass = make_pbr_material("WheelBrass", (0.88, 0.70, 0.25), metallic=0.92, roughness=0.2)
    obsidian = make_pbr_material("WheelHub", (0.07, 0.10, 0.14), metallic=0.4, roughness=0.35)
    crimson = make_pbr_material("FlapperLeather", (0.82, 0.12, 0.16), metallic=0.1, roughness=0.4)

    # Main wheel disc (80 vertices = 4 faces per 18-degree wedge)
    bpy.ops.mesh.primitive_cylinder_add(vertices=80, radius=1.8, depth=0.14, location=(0, 0, 0))
    wheel = bpy.context.active_object
    wheel.name = "WheelDisc"
    add_bevel(wheel, width=0.02, segments=3)
    wheel.data.materials.append(obsidian)

    # Outer brass rim torus
    bpy.ops.mesh.primitive_torus_add(major_radius=1.82, minor_radius=0.09, location=(0, 0, 0.02))
    rim = bpy.context.active_object
    rim.name = "WheelBrassRim"
    rim.data.materials.append(brass)
    rim.parent = wheel

    # Center brass cap
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.28, depth=0.22, location=(0, 0, 0.04))
    hub = bpy.context.active_object
    hub.name = "WheelCenterHub"
    add_bevel(hub, width=0.025, segments=3)
    hub.data.materials.append(brass)
    hub.parent = wheel

    # 20 physical brass pegs around the rim (every 18 degrees)
    for i in range(20):
        angle = math.radians(i * 18.0 - 81.0)
        px = 1.72 * math.cos(angle)
        py = 1.72 * math.sin(angle)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.032, depth=0.18, location=(px, py, 0.11))
        peg = bpy.context.active_object
        peg.name = f"WheelPeg_{i:02d}"
        add_bevel(peg, width=0.008, segments=2)
        peg.data.materials.append(brass)
        peg.parent = wheel

    # Top pointer flapper (separate object at (0, 1.92, 0.16) so Godot/Three.js can hinge-rotate it)
    bpy.ops.mesh.primitive_cone_add(
        vertices=24,
        radius1=0.11,
        radius2=0.015,
        depth=0.34,
        location=(0, 1.92, 0.16),
        rotation=(math.radians(90), 0, 0),
    )
    flapper = bpy.context.active_object
    flapper.name = "WheelFlapper"
    flapper.data.materials.append(crimson)

    export_glb("wheel_of_fortune.glb")


# ---------------------------------------------------------------------------
# 4. POWER-UP TABLE TOTEMS (Shield Dome, Sub-Zero Ice Block, Boomerang, Crown)
# ---------------------------------------------------------------------------
def build_powerup_totems():
    clear_scene()

    # 1) Shield Dome (Geodesic energy dome)
    shield_mat = make_pbr_material(
        "ShieldEnergy", (0.22, 0.62, 0.98), metallic=0.15, roughness=0.08,
        emission=(0.22, 0.62, 0.98), emission_strength=1.5, alpha=0.42
    )
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.65, location=(-2.2, 0, 0.65))
    dome = bpy.context.active_object
    dome.name = "Totem_ShieldDome"
    dome.data.materials.append(shield_mat)

    # 2) Sub-Zero Ice Block (Beveled refractive crystal)
    ice_mat = make_pbr_material(
        "SubZeroIce", (0.45, 0.88, 0.98), metallic=0.05, roughness=0.06,
        emission=(0.35, 0.80, 0.95), emission_strength=0.65, alpha=0.62, transmission=0.85
    )
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.7, 0, 0.55))
    ice = bpy.context.active_object
    ice.name = "Totem_SubZeroIce"
    add_bevel(ice, width=0.09, segments=3)
    ice.data.materials.append(ice_mat)

    # 3) Boomerang Totem (Sculpted V-wing aerodynamic boomerang)
    boom_mat = make_pbr_material(
        "BoomerangAmber", (0.94, 0.55, 0.14), metallic=0.45, roughness=0.25,
        emission=(0.94, 0.55, 0.14), emission_strength=0.35
    )
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.62, 0.18, 0.45), rotation=(0, 0, math.radians(32)))
    wing_a = bpy.context.active_object
    wing_a.scale = (0.55, 0.14, 0.05)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(wing_a, width=0.02, segments=2)
    wing_a.data.materials.append(boom_mat)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.98, 0.18, 0.45), rotation=(0, 0, math.radians(-32)))
    wing_b = bpy.context.active_object
    wing_b.scale = (0.55, 0.14, 0.05)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(wing_b, width=0.02, segments=2)
    wing_b.data.materials.append(boom_mat)

    bpy.ops.object.select_all(action="DESELECT")
    wing_a.select_set(True)
    wing_b.select_set(True)
    bpy.context.view_layer.objects.active = wing_a
    bpy.ops.object.join()
    wing_a.name = "Totem_Boomerang"

    # 4) Win-Streak Golden Crown (Royal circlet + 6 crown spires)
    crown_mat = make_pbr_material(
        "StreakGold", (0.96, 0.78, 0.22), metallic=0.92, roughness=0.16,
        emission=(0.96, 0.74, 0.18), emission_strength=0.4
    )
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.42, depth=0.18, location=(2.2, 0, 0.24))
    crown = bpy.context.active_object
    crown.name = "Totem_StreakCrown"
    add_bevel(crown, width=0.015, segments=2)
    crown.data.materials.append(crown_mat)

    crown_parts = [crown]
    for k in range(6):
        ang = math.radians(k * 60.0)
        cx = 2.2 + 0.36 * math.cos(ang)
        cy = 0.36 * math.sin(ang)
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.08, radius2=0.01, depth=0.22, location=(cx, cy, 0.42))
        spire = bpy.context.active_object
        spire.data.materials.append(crown_mat)
        crown_parts.append(spire)

    bpy.ops.object.select_all(action="DESELECT")
    for part in crown_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = crown
    bpy.ops.object.join()
    crown.name = "Totem_StreakCrown"

    export_glb("powerup_totems.glb")


if __name__ == "__main__":
    build_poker_chips()
    build_card_shoe()
    build_wheel_of_fortune()
    build_powerup_totems()
    print("[Grammar Casino Blender] All 4 .glb asset packs exported successfully to public/models/")
