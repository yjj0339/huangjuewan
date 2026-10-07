# Blender 无头精细建模：四种车辆（轿车/SUV/公交/货柜车）→ GLB
# 运行: blender -b -P tools/cars_blender.py
# 约定：车长沿 Y（-Y 为车头），上 +Z，轮轴沿 X；paint 材质=运行时 instanceColor 上色
# 可靠路线：盒子 + 大倒角 + SUBSURF 圆润化 + 布尔轮拱 + 细节件（不放样）
import bpy, math, os
from math import sin, cos, pi

OUT = r"E:\ZCODE\huangjuewan\assets\cars"
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metallic=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    return m


def box(name, sx, sy, sz, loc, material, bevel=0.03, taper=None, rot=(0, 0, 0), subsurf=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if taper:
        for v in ob.data.vertices:
            if v.co.z > 0:
                v.co.x *= taper[0]
                v.co.y *= taper[1]
    ob.data.materials.append(material)
    if bevel > 0:
        b = ob.modifiers.new("bev", 'BEVEL')
        b.width = bevel
        b.segments = 3
        b.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=b.name)
    if subsurf > 0:
        s = ob.modifiers.new("sub", 'SUBSURF')
        s.levels = subsurf
        s.render_levels = subsurf
        bpy.ops.object.modifier_apply(modifier=s.name)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def wheel(name, y, x, r, w, m_tire, m_chrome):
    # 轮胎 = 圆环；轮毂 = 盘 + 5 辐条（绕 X 轴放射）+ 中心帽
    bpy.ops.mesh.primitive_torus_add(major_radius=r * 0.82, minor_radius=r * 0.21,
                                     major_segments=24, minor_segments=10,
                                     location=(x, y, r), rotation=(pi / 2, 0, 0))
    t = bpy.context.object
    t.name = name + "_tire"
    t.scale = (1.0, w / (r * 0.34), w / (r * 0.34))
    bpy.ops.object.transform_apply(scale=True)
    t.data.materials.append(m_tire)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=r * 0.72, depth=w * 0.92,
                                        location=(x, y, r), rotation=(0, pi / 2, 0))
    rim = bpy.context.object
    rim.name = name + "_rim"
    rim.data.materials.append(m_chrome)
    for i in range(5):
        a = i * pi * 2 / 5
        box(name + "_spoke", w * 0.55, r * 0.58, 0.05,
            (x, y + sin(a) * r * 0.34, r + cos(a) * r * 0.34),
            m_chrome, 0.008, rot=(a, 0, 0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=r * 0.16, depth=w * 1.02,
                                        location=(x, y, r), rotation=(0, pi / 2, 0))
    hub = bpy.context.object
    hub.name = name + "_hub"
    hub.data.materials.append(m_tire)


def cut_wheel_arches(body, wheels, r):
    # 布尔挖轮拱（cutter 贯通车身两侧）
    for (y, x) in wheels:
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r + 0.10, depth=2.8,
                                            location=(0, y, r + 0.02), rotation=(0, pi / 2, 0))
        c = bpy.context.object
        mod = body.modifiers.new("bool", 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = c
        mod.solver = 'EXACT'
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(c, do_unlink=True)


def mirrors(name, m_paint, y, z, sx_half, sz=(0.22, 0.13, 0.12)):
    for sx in (-1, 1):
        box(name + "_mirror", sz[0], sz[1], sz[2], (sx * (sx_half + 0.10), y, z), m_paint, 0.03)
        box(name + "_mstalk", 0.12, 0.05, 0.045, (sx * (sx_half + 0.02), y, z), m_paint, 0.015)


def export(name):
    bpy.ops.object.select_all(action='SELECT')
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True)
    print("EXPORTED", path)


# ---------- 轿车 ----------
def sedan():
    reset()
    paint = mat("paint", (1, 1, 1), 0.85, 0.26)
    glass = mat("glass", (0.04, 0.07, 0.11), 0.5, 0.08)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.2)
    light = mat("light", (0.93, 0.95, 0.97), 0.3, 0.18)
    tail = mat("tail", (0.6, 0.05, 0.04), 0.3, 0.28)
    plate = mat("plate", (0.85, 0.86, 0.8), 0.2, 0.4)
    body = box("sedan_body", 1.80, 4.50, 0.64, (0, 0, 0.70), paint, 0.16, subsurf=1)
    box("sedan_cabin", 1.56, 2.30, 0.54, (0, 0.15, 1.26), paint, 0.13, taper=(0.78, 0.62), subsurf=1)
    box("sedan_wshld", 1.40, 0.05, 0.42, (0, -0.74, 1.28), glass, 0.02)
    box("sedan_rglass", 1.36, 0.05, 0.36, (0, 1.06, 1.26), glass, 0.02)
    for sx in (-1, 1):
        box("sedan_sglass", 0.05, 1.52, 0.34, (sx * 0.745, 0.15, 1.27), glass, 0.015)
    box("sedan_roof", 1.24, 1.28, 0.06, (0, 0.28, 1.52), paint, 0.03)
    box("sedan_skirt", 1.70, 3.60, 0.22, (0, 0, 0.36), trim, 0.05)
    wr = 0.34
    ws = [(-1.48, 0.80), (1.48, 0.80), (-1.48, -0.80), (1.48, -0.80)]
    cut_wheel_arches(body, ws, wr)
    for wy in (-1.48, 1.48):
        box("sedan_fender", 1.45, 1.15, 0.60, (0, wy, 0.50), trim, 0.03)
    box("sedan_bf", 1.80, 0.24, 0.30, (0, -2.36, 0.52), trim, 0.05)
    box("sedan_br", 1.80, 0.22, 0.28, (0, 2.36, 0.54), trim, 0.05)
    box("sedan_grille", 0.92, 0.07, 0.18, (0, -2.385, 0.86), trim, 0.02)
    for i in range(3):
        box("sedan_gbar", 0.84, 0.025, 0.028, (0, -2.415, 0.80 + i * 0.055), chrome, 0.006)
    box("sedan_plate", 0.44, 0.02, 0.13, (0, -2.40, 0.50), plate, 0.01)
    box("sedan_plate_r", 0.44, 0.02, 0.13, (0, 2.395, 0.55), plate, 0.01)
    for sx in (-1, 1):
        box("sedan_hl", 0.44, 0.10, 0.13, (sx * 0.60, -2.345, 0.92), light, 0.02)
        box("sedan_tl", 0.42, 0.08, 0.14, (sx * 0.62, 2.365, 0.90), tail, 0.02)
    mirrors("sedan", paint, -0.60, 1.12, 0.86)
    box("sedan_exh", 0.10, 0.12, 0.10, (0.58, 2.38, 0.36), chrome, 0.012)
    box("sedan_wiper", 0.70, 0.03, 0.03, (0, -0.86, 1.13), trim, 0.008)
    for (wy, wx) in ws:
        wheel("sedan_w", wy, wx, wr, 0.25, trim, chrome)
    export("sedan")


# ---------- SUV ----------
def suv():
    reset()
    paint = mat("paint", (1, 1, 1), 0.8, 0.3)
    glass = mat("glass", (0.04, 0.07, 0.11), 0.5, 0.08)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.2)
    light = mat("light", (0.93, 0.95, 0.97), 0.3, 0.18)
    tail = mat("tail", (0.6, 0.05, 0.04), 0.3, 0.28)
    plate = mat("plate", (0.85, 0.86, 0.8), 0.2, 0.4)
    body = box("suv_body", 1.94, 4.80, 0.85, (0, 0, 0.90), paint, 0.15, subsurf=1)
    box("suv_cabin", 1.78, 3.30, 0.70, (0, 0.35, 1.62), glass, 0.12, taper=(0.88, 0.80), subsurf=1)
    box("suv_roof", 1.58, 2.85, 0.09, (0, 0.40, 1.97), paint, 0.05)
    box("suv_skirt", 1.80, 3.80, 0.26, (0, 0, 0.46), trim, 0.05)
    wr = 0.40
    ws = [(-1.52, 0.84), (1.52, 0.84), (-1.52, -0.84), (1.52, -0.84)]
    cut_wheel_arches(body, ws, wr)
    for wy in (-1.52, 1.52):
        box("suv_fender", 1.50, 1.28, 0.72, (0, wy, 0.58), trim, 0.03)
    box("suv_bf", 1.92, 0.26, 0.36, (0, -2.46, 0.64), trim, 0.05)
    box("suv_br", 1.92, 0.24, 0.34, (0, 2.46, 0.66), trim, 0.05)
    box("suv_skid", 1.40, 0.80, 0.09, (0, -2.30, 0.42), chrome, 0.02)
    box("suv_grille", 1.02, 0.07, 0.26, (0, -2.485, 1.10), trim, 0.02)
    box("suv_plate", 0.44, 0.02, 0.13, (0, -2.53, 0.60), plate, 0.01)
    for sx in (-1, 1):
        box("suv_rail", 0.09, 2.30, 0.08, (sx * 0.60, 0.45, 2.05), trim, 0.02)
        box("suv_hl", 0.46, 0.10, 0.15, (sx * 0.64, -2.44, 1.22), light, 0.02)
        box("suv_tl", 0.15, 0.08, 0.44, (sx * 0.88, 2.475, 1.42), tail, 0.02)
    mirrors("suv", paint, -0.78, 1.48, 0.94)
    for (wy, wx) in ws:
        wheel("suv_w", wy, wx, wr, 0.29, trim, chrome)
    export("suv")


# ---------- 公交 ----------
def bus():
    reset()
    paint = mat("paint", (1, 1, 1), 0.6, 0.38)
    glass = mat("glass", (0.05, 0.09, 0.13), 0.5, 0.08)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.2)
    light = mat("light", (0.93, 0.95, 0.97), 0.3, 0.18)
    tail = mat("tail", (0.6, 0.05, 0.04), 0.3, 0.28)
    dest = mat("dest", (0.02, 0.16, 0.10), 0.4, 0.3)
    body = box("bus_body", 2.50, 11.20, 2.30, (0, 0, 1.95), paint, 0.20, subsurf=1)
    box("bus_skirt", 2.40, 10.60, 0.55, (0, 0, 0.62), trim, 0.06)
    box("bus_glassband", 2.54, 8.80, 0.85, (0, 0.20, 2.42), glass, 0.05)
    box("bus_wind", 2.28, 0.16, 1.35, (0, -5.58, 2.30), glass, 0.05)
    box("bus_rearw", 2.28, 0.14, 1.05, (0, 5.58, 2.35), glass, 0.05)
    for sx in (-1, 1):
        for yy in (-4.0, -1.9, 0.2, 2.3, 4.4):
            box("bus_pillar", 0.07, 0.16, 0.90, (sx * 1.26, yy, 2.42), paint, 0.012)
    box("bus_door", 0.06, 1.20, 2.00, (1.27, -3.60, 1.85), trim, 0.02)
    box("bus_dest", 1.70, 0.07, 0.30, (0, -5.63, 2.85), dest, 0.02)
    box("bus_roofac", 1.95, 3.30, 0.18, (0, 1.20, 3.12), trim, 0.04)
    wr = 0.50
    ws = [(-3.45, 1.08), (3.25, 1.08), (4.35, 1.08), (-3.45, -1.08), (3.25, -1.08), (4.35, -1.08)]
    cut_wheel_arches(body, ws, wr)
    for wy in (-3.45, 3.25, 4.35):
        box("bus_fender", 1.98, 1.35, 0.92, (0, wy, 0.66), trim, 0.03)
    for sx in (-1, 1):
        box("bus_hl", 0.48, 0.10, 0.20, (sx * 0.84, -5.66, 1.10), light, 0.02)
        box("bus_tl", 0.42, 0.08, 0.36, (sx * 0.96, 5.65, 1.40), tail, 0.02)
        box("bus_mirror", 0.26, 0.15, 0.58, (sx * 1.46, -5.15, 2.50), trim, 0.03)
    for (wy, wx) in ws:
        wheel("bus_w", wy, wx, wr, 0.34, trim, chrome)
    box("bus_bumper", 2.42, 0.20, 0.32, (0, -5.70, 0.82), trim, 0.04)
    box("bus_bumper_r", 2.42, 0.18, 0.30, (0, 5.68, 0.85), trim, 0.04)
    export("bus")


# ---------- 货柜车 ----------
def truck():
    reset()
    paint = mat("paint", (1, 1, 1), 0.75, 0.32)
    glass = mat("glass", (0.04, 0.07, 0.11), 0.5, 0.08)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.2)
    light = mat("light", (0.93, 0.95, 0.97), 0.3, 0.18)
    tail = mat("tail", (0.6, 0.05, 0.04), 0.3, 0.28)
    cargo = mat("cargo", (0.82, 0.84, 0.86), 0.3, 0.55)
    plate = mat("plate", (0.85, 0.86, 0.8), 0.2, 0.4)
    box("truck_chassis", 1.00, 9.60, 0.32, (0, 0.70, 0.66), trim, 0.03)
    box("truck_chassis2", 1.90, 3.60, 0.18, (0, 3.00, 0.86), trim, 0.03)
    cab = box("truck_cab", 2.32, 2.10, 2.10, (0, -4.10, 1.95), paint, 0.16, subsurf=1)
    box("truck_cabwin", 2.14, 0.14, 0.85, (0, -5.05, 2.50), glass, 0.04)
    box("truck_sunvisor", 2.24, 0.34, 0.07, (0, -4.98, 2.98), paint, 0.02)
    box("truck_grille", 1.62, 0.12, 0.85, (0, -5.10, 1.65), trim, 0.04)
    for i in range(4):
        box("truck_gbar", 1.52, 0.035, 0.06, (0, -5.18, 1.30 + i * 0.22), chrome, 0.008)
    box("truck_deflector", 2.24, 1.60, 0.12, (0, -3.55, 3.42), paint, 0.04)
    box("truck_plate", 0.44, 0.02, 0.13, (0, -5.18, 1.02), plate, 0.01)
    box("truck_container", 2.50, 8.30, 2.62, (0, 1.30, 2.38), cargo, 0.06)
    for sx in (-1, 1):
        for i in range(9):
            box("truck_rib", 0.06, 0.12, 2.36, (sx * 1.28, -2.25 + i * 0.92, 2.38), cargo, 0.012)
    box("truck_reardoor", 2.24, 0.07, 2.38, (0, 5.48, 2.38), trim, 0.02)
    wr = 0.48
    ws = [(-4.30, 0.98), (1.45, 0.98), (2.65, 0.98), (-4.30, -0.98), (1.45, -0.98), (2.65, -0.98)]
    cut_wheel_arches(cab, [(-4.30, 0.98), (-4.30, -0.98)], wr)
    for sx in (-1, 1):
        box("truck_stack", 0.13, 0.13, 1.85, (sx * 1.20, -3.45, 2.65), chrome, 0.02)
        box("truck_tank", 0.44, 1.70, 0.44, (sx * 1.08, -2.30, 0.88), chrome, 0.07)
        box("truck_step", 0.32, 0.65, 0.09, (sx * 1.24, -4.70, 0.55), trim, 0.015)
        box("truck_hl", 0.46, 0.10, 0.18, (sx * 0.84, -5.14, 1.10), light, 0.02)
        box("truck_tl", 0.40, 0.08, 0.32, (sx * 1.08, 5.52, 1.10), tail, 0.02)
        box("truck_mudflap", 0.58, 0.04, 0.58, (sx * 0.74, 5.55, 0.52), trim, 0.01)
        box("truck_mirror", 0.24, 0.13, 0.62, (sx * 1.40, -4.85, 2.65), trim, 0.03)
    for (wy, wx) in ws:
        wheel("truck_w", wy, wx, wr, 0.32, trim, chrome)
    box("truck_bumper", 2.32, 0.18, 0.28, (0, -5.22, 0.66), trim, 0.04)
    export("truck")


sedan()
suv()
bus()
truck()
print("ALL CARS DONE")
