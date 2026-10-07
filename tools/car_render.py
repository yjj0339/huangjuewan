# 车模目验渲染：加载每台 GLB 渲染三视图
import bpy, math, os
from math import radians

OUT = r"E:\ZCODE\huangjuewan\assets\cars\preview"
os.makedirs(OUT, exist_ok=True)
CARS = ["sedan", "suv", "bus", "truck"]
SRC = r"E:\ZCODE\huangjuewan\assets\cars"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 900
scene.render.resolution_y = 560
scene.render.film_transparent = False

world = bpy.data.worlds.new("w")
world.color = (0.9, 0.9, 0.92)
scene.world = world

cam = bpy.data.cameras.new("c")
camob = bpy.data.objects.new("cam", cam)
bpy.context.collection.objects.link(camob)
scene.camera = camob

for car in CARS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
    scn.render.resolution_x = 900
    scn.render.resolution_y = 560
    w = bpy.data.worlds.new("w"); w.color = (0.88, 0.89, 0.92); scn.world = w
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, car + ".glb"))
    # 相机：前侧 3/4 视角
    for ang, tag in [(radians(-40), "front"), (radians(140), "rear")]:
        sun_l = bpy.data.lights.new("s", 'SUN')
        sun_l.energy = 3
        a = bpy.data.objects.new("sun", sun_l)
        a.rotation_euler = (radians(50), 0, radians(30))
        bpy.context.collection.objects.link(a)
        cam_data = bpy.data.cameras.new("c")
        co = bpy.data.objects.new("cam", cam_data)
        bpy.context.collection.objects.link(co)
        scn.camera = co
        import mathutils
        L = 13.0 if car in ("bus", "truck") else 8.5
        co.location = (L * math.sin(ang), -L * math.cos(ang), 3.4)
        # 指向原点
        d = mathutils.Vector((0, 0, 0.9)) - co.location
        co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scn.render.filepath = os.path.join(OUT, f"{car}_{tag}.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(a, do_unlink=True)
print("PREVIEWS DONE")
