import initJolt from "jolt-physics/wasm";
import wasmUrl from "jolt-physics/jolt-physics.wasm.wasm?url";

type J = typeof initJolt;

export type Vec = { readonly x: number; readonly y: number; readonly z: number };
type Rot = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
};
type Material = { readonly friction: number; readonly restitution: number };
type Hit = { readonly a: number; readonly b: number; readonly speed: number };

type BlockSpec = {
  readonly hulls: readonly Float32Array[];
  readonly density: number;
  readonly material: Material;
  readonly position: Vec;
  readonly rotation: Rot;
  readonly damping: { readonly linear: number; readonly angular: number };
  readonly maxSpeed: number;
};

type JarSpec = {
  readonly meshes: readonly {
    readonly positions: Float32Array;
    readonly index: ArrayLike<number>;
  }[];
  readonly pieces: readonly Float32Array[];
  readonly density: number;
  readonly material: Material;
  readonly y: number;
  readonly damping: { readonly linear: number; readonly angular: number };
  readonly smooth: boolean;
};

export type Physics = {
  readonly addBox: (half: Vec, position: Vec, material: Material) => number;
  readonly addBlock: (spec: BlockSpec) => number;
  readonly addJar: (spec: JarSpec) => number;
  readonly setJarDynamic: (on: boolean) => void;
  readonly placeJar: (position: Vec) => void;
  readonly remove: (body: number) => void;
  readonly position: (body: number) => Vec;
  readonly rotation: (body: number) => Rot;
  readonly linvel: (body: number) => Vec;
  readonly angvel: (body: number) => Vec;
  readonly setVelocity: (body: number, linear: Vec, angular: Vec) => void;
  readonly impulse: (body: number, impulse: Vec, at?: Vec) => void;
  readonly angularImpulse: (body: number, impulse: Vec) => void;
  readonly mass: (body: number) => number;
  readonly sleeping: (body: number) => boolean;
  readonly sleep: (body: number) => void;
  readonly wake: (body: number) => void;
  readonly clearOf: (centre: Vec, radius: number) => boolean;
  readonly setGravity: (g: Vec) => void;
  readonly step: (seconds: number, substeps: number) => void;
  readonly drainHits: () => Hit[];
  readonly free: () => void;
};

const LAYER_STATIC = 0;
const LAYER_MOVING = 1;
// Jolt's defaults are for metre-sized bodies; a scene unit is 3.3 cm, so points slower than 1 cm/s may sleep
const SLEEP_POINT_SPEED = 0.3;
const HULL_CONVEX_RADIUS = 0.02;

const loaded: { jolt: Promise<J> | null } = { jolt: null };

const loadJolt = (): Promise<J> => {
  loaded.jolt ??= initJolt({ locateFile: () => wasmUrl }) as Promise<J>;
  return loaded.jolt;
};

export async function createPhysics(gravity: number): Promise<Physics> {
  const Jolt = await loadJolt();
  const settings = new Jolt.JoltSettings();
  const pairs = new Jolt.ObjectLayerPairFilterTable(2);
  pairs.EnableCollision(LAYER_STATIC, LAYER_MOVING);
  pairs.EnableCollision(LAYER_MOVING, LAYER_MOVING);
  const broad = new Jolt.BroadPhaseLayerInterfaceTable(2, 2);
  broad.MapObjectToBroadPhaseLayer(LAYER_STATIC, new Jolt.BroadPhaseLayer(0));
  broad.MapObjectToBroadPhaseLayer(LAYER_MOVING, new Jolt.BroadPhaseLayer(1));
  settings.mObjectLayerPairFilter = pairs;
  settings.mBroadPhaseLayerInterface = broad;
  settings.mObjectVsBroadPhaseLayerFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    broad,
    2,
    pairs,
    2,
  );
  const jolt = new Jolt.JoltInterface(settings);
  Jolt.destroy(settings);
  const system = jolt.GetPhysicsSystem();
  const api = system.GetBodyInterface();
  const ps = system.GetPhysicsSettings();
  ps.mPointVelocitySleepThreshold = SLEEP_POINT_SPEED;
  system.SetPhysicsSettings(ps);

  const v3 = new Jolt.Vec3(0, 0, 0);
  const v3b = new Jolt.Vec3(0, 0, 0);
  const r3 = new Jolt.RVec3(0, 0, 0);
  const q = new Jolt.Quat(0, 0, 0, 1);
  const vec = (p: Vec) => {
    v3.Set(p.x, p.y, p.z);
    return v3;
  };
  const rvec = (p: Vec) => {
    r3.Set(p.x, p.y, p.z);
    return r3;
  };
  const quat = (r: Rot) => {
    q.Set(r.x, r.y, r.z, r.w);
    return q;
  };
  const setGravity = (g: Vec) => system.SetGravity(vec(g));
  setGravity({ x: 0, y: -gravity, z: 0 });

  const ids = new Map<number, InstanceType<J["BodyID"]>>();
  const tag = { next: 1 };
  const jar = {
    id: null as InstanceType<J["BodyID"]> | null,
    smooth: null as InstanceType<J["Shape"]> | null,
    pieces: null as InstanceType<J["Shape"]> | null,
    dynamic: false,
  };
  const hits: Hit[] = [];

  const hull = (points: Float32Array, density: number) => {
    const s = new Jolt.ConvexHullShapeSettings();
    Array.from({ length: points.length / 3 }).forEach((_, i) => {
      v3.Set(points[i * 3] ?? 0, points[i * 3 + 1] ?? 0, points[i * 3 + 2] ?? 0);
      s.mPoints.push_back(v3);
    });
    s.mMaxConvexRadius = HULL_CONVEX_RADIUS;
    s.mDensity = density;
    return s;
  };

  const compound = (hulls: readonly Float32Array[], density: number) => {
    const s = new Jolt.StaticCompoundShapeSettings();
    hulls.forEach((h) => {
      const part = hull(h, density);
      v3.Set(0, 0, 0);
      q.Set(0, 0, 0, 1);
      s.AddShape(v3, q, part, 0);
    });
    const shape = s.Create().Get();
    shape.AddRef();
    Jolt.destroy(s);
    return shape;
  };

  const mesh = (meshes: JarSpec["meshes"]) => {
    const triangles = new Jolt.TriangleList();
    const corner = [new Jolt.Vec3(0, 0, 0), new Jolt.Vec3(0, 0, 0), new Jolt.Vec3(0, 0, 0)];
    meshes.forEach(({ positions, index }) => {
      Array.from({ length: index.length / 3 }).forEach((_, t) => {
        corner.forEach((c, k) => {
          const i = (index[t * 3 + k] ?? 0) * 3;
          c.Set(positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0);
        });
        const [a, b, c] = corner;
        if (a && b && c) {
          const tri = new Jolt.Triangle(a, b, c, 0, 0);
          triangles.push_back(tri);
          Jolt.destroy(tri);
        }
      });
    });
    corner.forEach((c) => Jolt.destroy(c));
    const s = new Jolt.MeshShapeSettings(triangles);
    Jolt.destroy(triangles);
    const shape = s.Create().Get();
    shape.AddRef();
    Jolt.destroy(s);
    return shape;
  };

  const register = (temporary: InstanceType<J["BodyID"]>) => {
    // returned BodyIDs are views of one shared scratch value, so keep a copy
    const id = new Jolt.BodyID(temporary.GetIndexAndSequenceNumber());
    const t = tag.next++;
    api.SetUserData(id, t);
    ids.set(t, id);
    return t;
  };

  const idOf = (body: number) => {
    const id = ids.get(body);
    if (!id) throw new Error(`no body ${body}`);
    return id;
  };

  const create = (settings: InstanceType<J["BodyCreationSettings"]>, activate: boolean) => {
    const id = api.CreateAndAddBody(
      settings,
      activate ? Jolt.EActivation_Activate : Jolt.EActivation_DontActivate,
    );
    Jolt.destroy(settings);
    return register(id);
  };

  const listener = new Jolt.ContactListenerJS();
  listener.OnContactValidate = () => Jolt.ValidateResult_AcceptAllContactsForThisBodyPair;
  listener.OnContactAdded = (p1: number, p2: number, pm: number) => {
    const b1 = Jolt.wrapPointer(p1, Jolt.Body);
    const b2 = Jolt.wrapPointer(p2, Jolt.Body);
    const n = Jolt.wrapPointer(pm, Jolt.ContactManifold).mWorldSpaceNormal;
    const [nx, ny, nz] = [n.GetX(), n.GetY(), n.GetZ()];
    const along = (b: typeof b1) => {
      const v = b.GetLinearVelocity();
      return v.GetX() * nx + v.GetY() * ny + v.GetZ() * nz;
    };
    hits.push({
      a: b1.GetUserData(),
      b: b2.GetUserData(),
      speed: Math.abs(along(b1) - along(b2)),
    });
  };
  listener.OnContactPersisted = () => undefined;
  listener.OnContactRemoved = () => undefined;
  system.SetContactListener(listener);

  const collide = new Jolt.CollideShapeSettings();
  const bpFilter = new Jolt.DefaultBroadPhaseLayerFilter(
    jolt.GetObjectVsBroadPhaseLayerFilter(),
    LAYER_MOVING,
  );
  const objFilter = new Jolt.DefaultObjectLayerFilter(
    jolt.GetObjectLayerPairFilter(),
    LAYER_MOVING,
  );
  const bodyFilter = new Jolt.BodyFilter();
  const shapeFilter = new Jolt.ShapeFilter();
  const found = { any: false };
  const collector = new Jolt.CollideShapeCollectorJS();
  collector.Reset = () => undefined;
  collector.OnBody = () => undefined;
  collector.AddHit = () => {
    found.any = true;
  };
  const origin = new Jolt.RVec3(0, 0, 0);

  return {
    addBox: (half, position, material) => {
      const shape = new Jolt.BoxShape(vec(half), 0.05);
      const s = new Jolt.BodyCreationSettings(
        shape,
        rvec(position),
        quat({ x: 0, y: 0, z: 0, w: 1 }),
        Jolt.EMotionType_Static,
        LAYER_STATIC,
      );
      s.mFriction = material.friction;
      s.mRestitution = material.restitution;
      return create(s, false);
    },
    addBlock: (spec) => {
      const shape = compound(spec.hulls, spec.density);
      const s = new Jolt.BodyCreationSettings(
        shape,
        rvec(spec.position),
        quat(spec.rotation),
        Jolt.EMotionType_Dynamic,
        LAYER_MOVING,
      );
      shape.Release();
      s.mFriction = spec.material.friction;
      s.mRestitution = spec.material.restitution;
      s.mLinearDamping = spec.damping.linear;
      s.mAngularDamping = spec.damping.angular;
      s.mMaxLinearVelocity = spec.maxSpeed;
      s.mMotionQuality = Jolt.EMotionQuality_LinearCast;
      s.mEnhancedInternalEdgeRemoval = true;
      return create(s, true);
    },
    addJar: (spec) => {
      jar.pieces = compound(spec.pieces, spec.density);
      jar.smooth = spec.smooth ? mesh(spec.meshes) : jar.pieces;
      const s = new Jolt.BodyCreationSettings(
        jar.smooth,
        rvec({ x: 0, y: spec.y, z: 0 }),
        quat({ x: 0, y: 0, z: 0, w: 1 }),
        Jolt.EMotionType_Static,
        LAYER_MOVING,
      );
      s.mAllowDynamicOrKinematic = true;
      s.mOverrideMassProperties = Jolt.EOverrideMassProperties_MassAndInertiaProvided;
      s.mMassPropertiesOverride = jar.pieces.GetMassProperties();
      s.mFriction = spec.material.friction;
      s.mRestitution = spec.material.restitution;
      s.mLinearDamping = spec.damping.linear;
      s.mAngularDamping = spec.damping.angular;
      s.mMotionQuality = Jolt.EMotionQuality_LinearCast;
      const body = create(s, false);
      jar.id = idOf(body);
      return body;
    },
    setJarDynamic: (on) => {
      const id = jar.id;
      if (!id || !jar.pieces || !jar.smooth || on === jar.dynamic) return;
      jar.dynamic = on;
      if (on) {
        if (jar.smooth !== jar.pieces)
          api.SetShape(id, jar.pieces, false, Jolt.EActivation_DontActivate);
        api.SetMotionType(id, Jolt.EMotionType_Dynamic, Jolt.EActivation_Activate);
        return;
      }
      api.SetMotionType(id, Jolt.EMotionType_Static, Jolt.EActivation_DontActivate);
      if (jar.smooth !== jar.pieces)
        api.SetShape(id, jar.smooth, false, Jolt.EActivation_DontActivate);
    },
    placeJar: (position) => {
      if (!jar.id) return;
      api.SetPositionAndRotation(
        jar.id,
        rvec(position),
        quat({ x: 0, y: 0, z: 0, w: 1 }),
        Jolt.EActivation_DontActivate,
      );
    },
    remove: (body) => {
      const id = ids.get(body);
      if (!id) return;
      api.RemoveBody(id);
      api.DestroyBody(id);
      Jolt.destroy(id);
      ids.delete(body);
    },
    position: (body) => {
      const p = api.GetPosition(idOf(body));
      return { x: p.GetX(), y: p.GetY(), z: p.GetZ() };
    },
    rotation: (body) => {
      const r = api.GetRotation(idOf(body));
      return { x: r.GetX(), y: r.GetY(), z: r.GetZ(), w: r.GetW() };
    },
    linvel: (body) => {
      const v = api.GetLinearVelocity(idOf(body));
      return { x: v.GetX(), y: v.GetY(), z: v.GetZ() };
    },
    angvel: (body) => {
      const v = api.GetAngularVelocity(idOf(body));
      return { x: v.GetX(), y: v.GetY(), z: v.GetZ() };
    },
    setVelocity: (body, linear, angular) => {
      v3b.Set(angular.x, angular.y, angular.z);
      api.SetLinearAndAngularVelocity(idOf(body), vec(linear), v3b);
      api.ActivateBody(idOf(body));
    },
    impulse: (body, impulse, at) => {
      const id = idOf(body);
      if (at) api.AddImpulse(id, vec(impulse), rvec(at));
      else api.AddImpulse(id, vec(impulse));
      api.ActivateBody(id);
    },
    angularImpulse: (body, impulse) => {
      api.AddAngularImpulse(idOf(body), vec(impulse));
      api.ActivateBody(idOf(body));
    },
    mass: (body) => {
      const lock = system.GetBodyLockInterfaceNoLock().TryGetBody(idOf(body));
      const inverse = lock.GetMotionProperties().GetInverseMass();
      return inverse > 0 ? 1 / inverse : 0;
    },
    sleeping: (body) => !api.IsActive(idOf(body)),
    sleep: (body) => api.DeactivateBody(idOf(body)),
    wake: (body) => api.ActivateBody(idOf(body)),
    clearOf: (centre, radius) => {
      found.any = false;
      const at = Jolt.RMat44.prototype.sTranslation(rvec(centre));
      v3b.Set(1, 1, 1);
      const s = new Jolt.SphereShape(radius);
      system
        .GetNarrowPhaseQuery()
        .CollideShape(
          s,
          v3b,
          at,
          collide,
          origin,
          collector,
          bpFilter,
          objFilter,
          bodyFilter,
          shapeFilter,
        );
      Jolt.destroy(s);
      return !found.any;
    },
    setGravity,
    step: (seconds, substeps) => jolt.Step(seconds, substeps),
    drainHits: () => hits.splice(0),
    free: () => {
      [...ids.values()].forEach((id) => {
        api.RemoveBody(id);
        api.DestroyBody(id);
        Jolt.destroy(id);
      });
      ids.clear();
      [
        listener,
        collide,
        bpFilter,
        objFilter,
        bodyFilter,
        shapeFilter,
        collector,
        origin,
        v3,
        v3b,
        r3,
        q,
      ].forEach((o) => Jolt.destroy(o));
      Jolt.destroy(jolt);
    },
  };
}
