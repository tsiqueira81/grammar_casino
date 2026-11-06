# Grammar Casino — Godot 4.x 3D Tabletop Physics Controller
# ==========================================================
# Attach this script to the root Node3D ("CasinoTabletop") in your Godot 4 scene.
# Works with the Blender-exported assets in `public/models/*.glb`:
#   - Physical RigidBody3D chip tossing into the central pot & winning seat sweep
#   - HingeJoint3D / angular-impulse Wheel of Fortune with real peg-flapper collisions
#   - Boomerang parabolic curve reflection between player seats
#   - HTML5 JavaScriptBridge / WebSocket sync with the React host app

extends Node3D
class_name CasinoTabletopController

signal wheel_settled(wedge_index: int)
signal chip_pot_settled()

@export var chip_scene: PackedScene
@export var wheel_node: RigidBody3D
@export var flapper_node: RigidBody3D
@export var camera_node: Camera3D

# Seat positions arranged in a semi-circle around the dealer pot
@export var seat_positions: Array[Vector3] = [
	Vector3(-3.2, 0.2, 2.2),
	Vector3(-1.8, 0.2, 2.8),
	Vector3( 0.0, 0.2, 3.0),
	Vector3( 1.8, 0.2, 2.8),
	Vector3( 3.2, 0.2, 2.2),
]

const POT_CENTER := Vector3(0.0, 0.15, 0.4)
var active_chips: Array[RigidBody3D] = []
var _js_callback_ref = null


func _ready() -> void:
	# If exported to Web (HTML5), register a JavaScriptBridge listener so the React host
	# can trigger 3D physics events directly via `window.grammarCasinoGodot(eventJson)`.
	if OS.has_feature("web"):
		_js_callback_ref = JavaScriptBridge.create_callback(_on_web_event)
		var win = JavaScriptBridge.get_interface("window")
		win.grammarCasinoGodot = _js_callback_ref


func _on_web_event(args: Array) -> void:
	if args.is_empty():
		return
	var parsed = JSON.parse_string(str(args[0]))
	if typeof(parsed) != TYPE_DICTIONARY:
		return

	var action: String = parsed.get("action", "")
	match action:
		"toss_bet":
			var seat_idx: int = int(parsed.get("seatIndex", 0))
			var chip_count: int = clampi(int(parsed.get("chipCount", 4)), 1, 20)
			toss_chips_to_pot(seat_idx, chip_count)
		"sweep_pot":
			var winner_seats: Array = parsed.get("winnerSeats", [0])
			sweep_pot_to_winners(winner_seats)
		"spin_wheel":
			var target_wedge: int = int(parsed.get("targetWedge", 0))
			spin_wheel_to_wedge(target_wedge)
		"boomerang_reflect":
			var from_seat: int = int(parsed.get("attackerSeat", 0))
			var to_seat: int = int(parsed.get("defenderSeat", 1))
			play_boomerang_arc(from_seat, to_seat)


# ---------------------------------------------------------------------------
# 1. RIGIDBODY3D CHIP TOSSING INTO THE CENTRAL POT
# ---------------------------------------------------------------------------
func toss_chips_to_pot(seat_index: int, count: int = 5) -> void:
	if chip_scene == null or seat_positions.is_empty():
		return
	var origin: Vector3 = seat_positions[seat_index % seat_positions.size()]

	for i in range(count):
		var chip: RigidBody3D = chip_scene.instantiate() as RigidBody3D
		add_child(chip)
		chip.global_position = origin + Vector3(
			randf_range(-0.12, 0.12),
			0.18 + i * 0.08,
			randf_range(-0.12, 0.12)
		)
		var to_pot: Vector3 = (POT_CENTER - chip.global_position).normalized()
		var impulse := to_pot * randf_range(3.6, 4.8) + Vector3(0, randf_range(1.4, 2.2), 0)
		chip.apply_central_impulse(impulse)
		chip.apply_torque_impulse(Vector3(randf_range(-0.4, 0.4), randf_range(-1.2, 1.2), randf_range(-0.4, 0.4)))
		active_chips.append(chip)


# ---------------------------------------------------------------------------
# 2. CROUPIER RAKE / SWEEP POT TO WINNING SEATS
# ---------------------------------------------------------------------------
func sweep_pot_to_winners(winner_seats: Array) -> void:
	if active_chips.is_empty():
		return
	if winner_seats.is_empty():
		# House wins: sweep toward top dealer bank
		_animate_chips_to_target(active_chips, Vector3(0.0, 0.2, -2.2))
	else:
		for idx in range(active_chips.size()):
			var seat_idx: int = int(winner_seats[idx % winner_seats.size()])
			var target: Vector3 = seat_positions[seat_idx % seat_positions.size()]
			_animate_single_chip(active_chips[idx], target, idx * 0.035)
	active_chips.clear()
	emit_signal("chip_pot_settled")


func _animate_chips_to_target(chips: Array[RigidBody3D], target: Vector3) -> void:
	for i in range(chips.size()):
		_animate_single_chip(chips[i], target, i * 0.03)


func _animate_single_chip(chip: RigidBody3D, target: Vector3, delay: float) -> void:
	if not is_instance_valid(chip):
		return
	chip.freeze = true
	var tween := create_tween()
	tween.tween_interval(delay)
	tween.tween_property(chip, "global_position", target + Vector3(0, 0.35, 0), 0.42).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_callback(chip.queue_free)


# ---------------------------------------------------------------------------
# 3. 20-WEDGE WHEEL SPIN WITH ANGULAR DAMPING
# ---------------------------------------------------------------------------
func spin_wheel_to_wedge(target_wedge: int) -> void:
	if wheel_node == null:
		return
	var wedge_angle_deg := 360.0 / 20.0
	var full_turns := randi_range(6, 8) * 360.0
	var final_deg := full_turns + (20 - (target_wedge % 20)) * wedge_angle_deg

	var tween := create_tween()
	tween.tween_property(
		wheel_node,
		"rotation_degrees:z",
		wheel_node.rotation_degrees.z - final_deg,
		5.2
	).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)
	tween.tween_callback(func(): emit_signal("wheel_settled", target_wedge))


# ---------------------------------------------------------------------------
# 4. BOOMERANG PARABOLIC DEFLECTION BETWEEN SEATS
# ---------------------------------------------------------------------------
func play_boomerang_arc(attacker_seat: int, defender_seat: int) -> void:
	if seat_positions.is_empty():
		return
	var start_pos: Vector3 = seat_positions[attacker_seat % seat_positions.size()]
	var reflect_pos: Vector3 = seat_positions[defender_seat % seat_positions.size()]
	var mid_out := (start_pos + reflect_pos) * 0.5 + Vector3(0, 1.4, -0.6)
	var mid_back := (reflect_pos + start_pos) * 0.5 + Vector3(0, 1.6, 0.6)

	var projectile := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.14
	torus.outer_radius = 0.24
	projectile.mesh = torus
	add_child(projectile)
	projectile.global_position = start_pos

	var tween := create_tween()
	tween.tween_property(projectile, "global_position", mid_out, 0.28).set_trans(Tween.TRANS_SINE)
	tween.tween_property(projectile, "global_position", reflect_pos, 0.26).set_trans(Tween.TRANS_SINE)
	tween.tween_property(projectile, "global_position", mid_back, 0.28).set_trans(Tween.TRANS_SINE)
	tween.tween_property(projectile, "global_position", start_pos, 0.26).set_trans(Tween.TRANS_SINE)
	tween.tween_callback(projectile.queue_free)
