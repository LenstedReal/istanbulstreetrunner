// Bakes a group of small meshes into a few meshes with vertex colours, so a tram
// built from 33 boxes costs 2–3 draw calls instead of 33. Written here instead of
// using three's BufferGeometryUtils so it has no extra import paths on Metro.
import * as THREE from "three";

type AnyMat = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
};

interface Entry {
  mesh: THREE.Mesh;
  matrix: THREE.Matrix4;
}

interface Bucket {
  key: string;
  template: AnyMat;
  entries: Entry[];
  vertices: number;
  hasUv: boolean;
}

const tmpPos = new THREE.Vector3();
const tmpNrm = new THREE.Vector3();
const tmpColor = new THREE.Color();
const normalMatrix = new THREE.Matrix3();
const relative = new THREE.Matrix4();
const inverseRoot = new THREE.Matrix4();

function materialKey(m: AnyMat): string {
  // Colour is baked into vertices; everything else must match to share a material.
  return [
    m.type,
    m.transparent ? `t${m.opacity}` : "o",
    m.emissive ? `${m.emissive.getHexString()}:${m.emissiveIntensity ?? 1}` : "-",
    m.map ? m.map.uuid : "-",
    m.side,
    (m as THREE.MeshBasicMaterial).fog === false ? "nf" : "f",
    (m as THREE.MeshLambertMaterial).flatShading ? "flat" : "smooth",
  ].join("|");
}

/** Can this mesh be baked? Instanced meshes and multi-materials stay as they are. */
function mergeable(mesh: THREE.Mesh): boolean {
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) return false;
  if (Array.isArray(mesh.material)) return false;
  const geo = mesh.geometry as THREE.BufferGeometry;
  return !!geo.getAttribute("position") && !!geo.getAttribute("normal");
}

function vertexCount(mesh: THREE.Mesh): number {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const index = geo.getIndex();
  return index ? index.count : geo.getAttribute("position").count;
}

export interface MergedPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Collect every visible, bakeable mesh under `root` (in root space) into one
 * geometry per material kind. Meshes that cannot be baked are returned in `kept`.
 * `materialCache` lets many merges share the same vertex-coloured materials.
 */
export function bakeGroup(
  root: THREE.Object3D,
  materialCache: Map<string, THREE.Material>,
  filter: (mesh: THREE.Mesh) => boolean = () => true,
): { parts: MergedPart[]; kept: THREE.Mesh[] } {
  root.updateMatrixWorld(true);
  inverseRoot.copy(root.matrixWorld).invert();
  const buckets = new Map<string, Bucket>();
  const kept: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!isVisibleUpTo(mesh, root)) return;
    if (!mergeable(mesh) || !filter(mesh)) {
      kept.push(mesh);
      return;
    }
    const mat = mesh.material as AnyMat;
    const key = materialKey(mat);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, template: mat, entries: [], vertices: 0, hasUv: true };
      buckets.set(key, bucket);
    }
    bucket.entries.push({ mesh, matrix: new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld) });
    bucket.vertices += vertexCount(mesh);
    if (!(mesh.geometry as THREE.BufferGeometry).getAttribute("uv")) bucket.hasUv = false;
  });
  const parts: MergedPart[] = [];
  for (const b of buckets.values()) {
    const n = b.vertices;
    const positions = new Float32Array(n * 3);
    const normals = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const uvs = b.hasUv || b.template.map ? new Float32Array(n * 2) : null;
    let v = 0;
    for (const { mesh, matrix } of b.entries) {
      const geo = mesh.geometry as THREE.BufferGeometry;
      const pos = geo.getAttribute("position");
      const nrm = geo.getAttribute("normal");
      const uv = geo.getAttribute("uv");
      const index = geo.getIndex();
      const mc = (mesh.material as AnyMat).color;
      if (mc) tmpColor.copy(mc);
      else tmpColor.setRGB(1, 1, 1);
      normalMatrix.getNormalMatrix(matrix);
      const count = index ? index.count : pos.count;
      for (let k = 0; k < count; k++, v++) {
        const i = index ? index.getX(k) : k;
        tmpPos.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        tmpNrm.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
        positions[v * 3] = tmpPos.x;
        positions[v * 3 + 1] = tmpPos.y;
        positions[v * 3 + 2] = tmpPos.z;
        normals[v * 3] = tmpNrm.x;
        normals[v * 3 + 1] = tmpNrm.y;
        normals[v * 3 + 2] = tmpNrm.z;
        colors[v * 3] = tmpColor.r;
        colors[v * 3 + 1] = tmpColor.g;
        colors[v * 3 + 2] = tmpColor.b;
        if (uvs) {
          uvs[v * 2] = uv ? uv.getX(i) : 0;
          uvs[v * 2 + 1] = uv ? uv.getY(i) : 0;
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (uvs) geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const cachedMaterial = materialCache.get(b.key);
    const material: THREE.Material = cachedMaterial ?? b.template.clone();
    if (!cachedMaterial) {
      (material as AnyMat).color?.set(0xffffff);
      (material as THREE.MeshLambertMaterial).vertexColors = true;
      materialCache.set(b.key, material);
    }
    parts.push({ geometry, material });
  }
  return { parts, kept };
}

function isVisibleUpTo(o: THREE.Object3D, root: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p && p !== root) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}

/** Build a ready group from a prototype: baked parts plus clones of the meshes that could not be baked. */
export function mergedGroup(proto: THREE.Object3D, materialCache: Map<string, THREE.Material>, shadows: { cast: boolean; receive: boolean }): THREE.Group {
  const { parts, kept } = bakeGroup(proto, materialCache);
  const g = new THREE.Group();
  for (const p of parts) {
    const m = new THREE.Mesh(p.geometry, p.material);
    m.castShadow = shadows.cast;
    m.receiveShadow = shadows.receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    g.add(m);
  }
  proto.updateMatrixWorld(true);
  inverseRoot.copy(proto.matrixWorld).invert();
  for (const k of kept) {
    const c = new THREE.Mesh(k.geometry, k.material);
    relative.multiplyMatrices(inverseRoot, k.matrixWorld);
    relative.decompose(c.position, c.quaternion, c.scale);
    c.castShadow = shadows.cast;
    c.receiveShadow = shadows.receive;
    g.add(c);
  }
  return g;
}

/** Clone a merged group cheaply: geometry and materials are shared. */
export function cloneShared(src: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  for (const child of src.children) {
    const m = child as THREE.Mesh;
    const c = new THREE.Mesh(m.geometry, m.material);
    c.position.copy(m.position);
    c.quaternion.copy(m.quaternion);
    c.scale.copy(m.scale);
    c.castShadow = m.castShadow;
    c.receiveShadow = m.receiveShadow;
    c.matrixAutoUpdate = m.matrixAutoUpdate;
    if (!m.matrixAutoUpdate) c.updateMatrix();
    g.add(c);
  }
  return g;
}
