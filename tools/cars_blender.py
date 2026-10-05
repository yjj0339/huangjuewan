# Blender 无头建模：四种精细车辆（轿车/SUV/公交/货柜车）→ GLB
# 运行: blender -b -P tools/cars_blender.py
import bpy, math, os

OUT = r"E:\ZCODE\huangjuewan\assets\cars"
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metallic=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    return m


def smooth_obj(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def add_box(name, sx, sy, sz, loc, material, bevel=0.06, taper=None, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
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
        b = ob.modifiers.new("bev", "BEVEL")
        b.width = bevel
        b.segments = 2
        b.limit_method = 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=b.name)
    if smooth:
        smooth_obj(ob)
    return ob


def add_cyl(name, r, depth, loc, material, axis='X', verts=28, bevel=0.0, smooth=True):
    rot = (0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(material)
    if smooth:
        smooth_obj(ob)
    return ob


def wheel(y, x, r, w, m_tire, m_chrome):
    add_cyl("tire", r, w, (x, y, r), m_tire)
    add_cyl("rim", r * 0.62, w * 1.06, (x, y, r), m_chrome)
    add_cyl("hub", r * 0.22, w * 1.12, (x, y, r), m_tire)


def export(name):
    bpy.ops.object.select_all(action='SELECT')
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True)
    print("EXPORTED", path)


# ---------- 轿车 ----------
def sedan():
    reset()
    paint = mat("paint", (1, 1, 1), 0.85, 0.28)
    glass = mat("glass", (0.05, 0.09, 0.13), 0.4, 0.1)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.22)
    light = mat("light", (0.92, 0.94, 0.96), 0.3, 0.2)
    tail = mat("tail", (0.55, 0.06, 0.04), 0.3, 0.3)
    add_box("skirt", 1.56, 3.5, 0.3, (0, 0, 0.36), paint, 0.05)
    add_box("body", 1.82, 4.55, 0.66, (0, 0, 0.7), paint, 0.1, smooth=True)
    add_box("cabin", 1.64, 2.35, 0.52, (0, 0.12, 1.22), glass, 0.07, taper=(0.84, 0.72), smooth=True)
    add_box("roof", 1.42, 1.85, 0.07, (0, 0.1, 1.47), paint, 0.04, smooth=True)
    add_box("bumper_f", 1.84, 0.3, 0.32, (0, -2.3, 0.5), trim, 0.05)
    add_box("bumper_r", 1.84, 0.3, 0.32, (0, 2.3, 0.5), trim, 0.05)
    add_box("grille", 1.1, 0.1, 0.2, (0, -2.36, 0.78), trim, 0.03)
    for sx in (-1, 1):
        add_box("hl", 0.44, 0.1, 0.15, (sx * 0.62, -2.3, 0.82), light, 0.03)
        add_box("tl", 0.44, 0.1, 0.15, (sx * 0.62, 2.3, 0.85), tail, 0.03)
        add_box("mirror", 0.2, 0.12, 0.11, (sx * 0.98, -0.55, 1.12), paint, 0.03)
        wheel(-1.45, sx * 0.8, 0.34, 0.24, trim, chrome)
        wheel(1.45, sx * 0.8, 0.34, 0.24, trim, chrome)
    export("sedan")


# ---------- SUV ----------
def suv():
    reset()
    paint = mat("paint", (1, 1, 1), 0.8, 0.32)
    glass = mat("glass", (0.05, 0.09, 0.13), 0.4, 0.1)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.22)
    light = mat("light", (0.92, 0.94, 0.96), 0.3, 0.2)
    tail = mat("tail", (0.55, 0.06, 0.04), 0.3, 0.3)
    add_box("skirt", 1.66, 3.7, 0.36, (0, 0, 0.44), trim, 0.05)
    add_box("body", 1.92, 4.75, 0.9, (0, 0, 0.86), paint, 0.1, smooth=True)
    add_box("cabin", 1.76, 2.95, 0.62, (0, 0.25, 1.62), glass, 0.08, taper=(0.88, 0.8), smooth=True)
    add_box("roof", 1.56, 2.5, 0.08, (0, 0.22, 1.93), paint, 0.04, smooth=True)
    for sx in (-1, 1):
        add_box("rail", 0.07, 2.2, 0.06, (sx * 0.62, 0.22, 1.99), trim, 0.02)
        add_box("hl", 0.46, 0.1, 0.18, (sx * 0.64, -2.42, 1.0), light, 0.03)
        add_box("tl", 0.44, 0.1, 0.2, (sx * 0.66, 2.42, 1.05), tail, 0.03)
        add_box("mirror", 0.22, 0.13, 0.12, (sx * 1.02, -0.7, 1.5), paint, 0.03)
        wheel(-1.5, sx * 0.84, 0.4, 0.27, trim, chrome)
        wheel(1.5, sx * 0.84, 0.4, 0.27, trim, chrome)
    add_box("bumper_f", 1.94, 0.32, 0.4, (0, -2.42, 0.55), trim, 0.05)
    add_box("bumper_r", 1.94, 0.32, 0.4, (0, 2.42, 0.55), trim, 0.05)
    export("suv")


# ---------- 公交 ----------
def bus():
    reset()
    paint = mat("paint", (1, 1, 1), 0.6, 0.4)
    glass = mat("glass", (0.06, 0.1, 0.14), 0.4, 0.1)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.22)
    light = mat("light", (0.92, 0.94, 0.96), 0.3, 0.2)
    tail = mat("tail", (0.55, 0.06, 0.04), 0.3, 0.3)
    add_box("skirt", 2.3, 10.9, 0.5, (0, 0, 0.52), trim, 0.05)
    add_box("body", 2.5, 11.2, 2.0, (0, 0, 1.65), paint, 0.08, smooth=True)
    add_box("wind_f", 2.3, 0.12, 1.0, (0, -5.63, 2.15), glass, 0.03)
    add_box("wind_r", 2.3, 0.12, 0.85, (0, 5.63, 2.2), glass, 0.03)
    for sx in (-1, 1):
        add_box("sidewin", 0.1, 9.6, 0.72, (sx * 1.28, -0.3, 2.28), glass, 0.03)
        add_box("hl", 0.5, 0.1, 0.2, (sx * 0.8, -5.66, 0.95), light, 0.03)
        add_box("tl", 0.4, 0.1, 0.22, (sx * 0.9, 5.66, 1.05), tail, 0.03)
        for yy in (-3.8, 3.0, 4.15):
            wheel(yy, sx * 1.06, 0.5, 0.3, trim, chrome)
    add_box("roofcap", 2.3, 10.9, 0.14, (0, 0, 2.72), paint, 0.05, smooth=True)
    export("bus")


# ---------- 货柜车 ----------
def truck():
    reset()
    paint = mat("paint", (1, 1, 1), 0.75, 0.35)
    glass = mat("glass", (0.05, 0.09, 0.13), 0.4, 0.1)
    trim = mat("trim", (0.05, 0.055, 0.06), 0.2, 0.72)
    chrome = mat("chrome", (0.72, 0.75, 0.78), 0.95, 0.22)
    light = mat("light", (0.92, 0.94, 0.96), 0.3, 0.2)
    tail = mat("tail", (0.55, 0.06, 0.04), 0.3, 0.3)
    cargo = mat("cargo", (0.82, 0.84, 0.86), 0.3, 0.55)
    add_box("chassis", 1.9, 9.6, 0.42, (0, 0.6, 0.66), trim, 0.04)
    add_box("cab", 2.3, 2.5, 1.75, (0, -3.55, 1.75), paint, 0.1, smooth=True)
    add_box("cabwin", 2.1, 1.4, 0.62, (0, -3.75, 2.35), glass, 0.05, smooth=True)
    add_box("cabroof", 2.1, 2.2, 0.12, (0, -3.5, 2.72), paint, 0.04)
    add_box("container", 2.5, 8.4, 2.65, (0, 1.15, 2.2), cargo, 0.06, smooth=True)
    for sx in (-1, 1):
        add_box("hl", 0.46, 0.1, 0.2, (sx * 0.8, -4.86, 0.95), light, 0.03)
        add_box("tl", 0.4, 0.1, 0.24, (sx * 1.0, 5.4, 1.1), tail, 0.03)
        add_box("mirror", 0.2, 0.13, 0.5, (sx * 1.28, -4.6, 2.3), trim, 0.03)
        wheel(-3.9, sx * 0.95, 0.46, 0.3, trim, chrome)
        wheel(1.5, sx * 0.95, 0.46, 0.3, trim, chrome)
        wheel(2.7, sx * 0.95, 0.46, 0.3, trim, chrome)
    export("truck")


sedan()
suv()
bus()
truck()
print("ALL DONE")