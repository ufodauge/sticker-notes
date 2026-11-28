import * as THREE from "three";
import type { Sticker } from "../../core/payload.ts";
import { jumble } from "../album/jumble.ts";
import { paintFace, stickerCanvas, type FaceArt } from "../album/page-paint.ts";

// The real album's things on the three-dimensional desk (`?room`): the open spread's pages
// painted the way the 2D album paints them, the drawer in the desk's front with the stickers
// thrown into it, and the clear pocket with what was received peeking out of it.

type Kept = { readonly id: string; readonly sticker: Sticker };

// what of the album the desk shows
export type RoomContent = {
  // the open spread: its left and right halves
  readonly left: FaceArt;
  readonly right: FaceArt;
  // in the drawer, the latest last
  readonly drawer: readonly Kept[];
  // in the pocket, the first on top
  readonly pocket: readonly Kept[];
};

const sRGB = (t: THREE.CanvasTexture): THREE.CanvasTexture => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// a page as the 2D album draws it (the size of a page there, twice over for sharpness)
const paintedPage = (face: FaceArt, spine: "left" | "right"): THREE.CanvasTexture =>
  sRGB(new THREE.CanvasTexture(paintFace(face, 300, 400, 2, spine)));

const stickerTexture = (s: Sticker): THREE.CanvasTexture => {
  const t = sRGB(new THREE.CanvasTexture(stickerCanvas(s)));
  t.magFilter = THREE.NearestFilter;
  return t;
};

const replaceMap = (m: THREE.MeshStandardMaterial, map: THREE.Texture | null) => {
  m.map?.dispose();
  m.map = map;
  m.needsUpdate = true;
};

// The drawer's box: floor, sides and back behind the front, laid so its front edge is at z = 0
// (the group is placed where the front is). The floor is painted with what lies in it.
export type DrawerBox = {
  readonly group: THREE.Group;
  readonly fill: (stickers: readonly Kept[]) => void;
};

const DRAWER = { w: 1.0, d: 0.55, h: 0.11 };
// how far it comes out when pulled
export const DRAWER_PULL = 0.42;

const drawerFloor = (stickers: readonly Kept[]): THREE.CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 564;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#c79c72";
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    // the latest lie at the front, the part that comes out when the drawer is pulled
    stickers.slice(-14).forEach((s, i, all) => {
      const size = 150;
      const row = all.length - 1 - i;
      const x = c.width / 2 + jumble(s.id, c.width * 0.8, 6) + ((row * 137) % 90) - 45;
      const y = c.height * 0.88 - (row % 4) * 70 + jumble(s.id, 60, 8);
      g.save();
      g.translate(x, y);
      g.rotate((jumble(s.id, 70, 10) * Math.PI) / 180);
      g.shadowColor = "rgb(0 0 0 / 0.3)";
      g.shadowBlur = 4;
      g.shadowOffsetY = 2;
      g.drawImage(stickerCanvas(s.sticker), -size / 2, -size / 2, size, size);
      g.restore();
    });
  }
  return sRGB(new THREE.CanvasTexture(c));
};

export function makeDrawerBox(): DrawerBox {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: "#a8754a", roughness: 0.8 });
  const parts: readonly (readonly [number, number, number, number, number, number])[] = [
    // w, h, d, x, y, z
    [DRAWER.w, 0.01, DRAWER.d, 0, 0.005, -DRAWER.d / 2],
    [0.015, DRAWER.h, DRAWER.d, -DRAWER.w / 2, DRAWER.h / 2, -DRAWER.d / 2],
    [0.015, DRAWER.h, DRAWER.d, DRAWER.w / 2, DRAWER.h / 2, -DRAWER.d / 2],
    [DRAWER.w, DRAWER.h, 0.015, 0, DRAWER.h / 2, -DRAWER.d],
  ];
  parts.forEach(([w, h, d, x, y, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
  });
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(DRAWER.w - 0.02, DRAWER.d - 0.02), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.0105, -DRAWER.d / 2);
  floor.receiveShadow = true;
  group.add(floor);
  return { group, fill: (stickers) => replaceMap(floorMat, drawerFloor(stickers)) };
}

// The clear pocket: a sleeve of film lying on the desk, the stickers in it showing through and
// the first few peeking out of its open back edge.
export type Pocket = {
  readonly group: THREE.Group;
  readonly fill: (stickers: readonly Kept[]) => void;
};

const SLEEVE = { w: 0.42, d: 0.38 };
const PEEKING = 3;

export function makePocket(): Pocket {
  const group = new THREE.Group();
  const inside = new THREE.Group();
  group.add(inside);
  const sleeveGeo = new THREE.BoxGeometry(SLEEVE.w, 0.008, SLEEVE.d);
  const sleeve = new THREE.Mesh(
    sleeveGeo,
    new THREE.MeshStandardMaterial({
      color: "#eef5fa",
      transparent: true,
      opacity: 0.3,
      roughness: 0.12,
      depthWrite: false,
    }),
  );
  sleeve.position.y = 0.012;
  sleeve.renderOrder = 1;
  group.add(sleeve);
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(sleeveGeo),
    new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 }),
  );
  rim.position.y = 0.012;
  group.add(rim);
  const fill = (stickers: readonly Kept[]) => {
    inside.children.forEach((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        o.material.map?.dispose();
        o.material.dispose();
        o.geometry.dispose();
      }
    });
    inside.clear();
    stickers
      .slice(0, PEEKING)
      .toReversed()
      .forEach((s, k, all) => {
        const i = all.length - 1 - k;
        const art = new THREE.Mesh(
          new THREE.PlaneGeometry(0.17, 0.17),
          new THREE.MeshStandardMaterial({
            map: stickerTexture(s.sticker),
            transparent: true,
            alphaTest: 0.5,
            roughness: 0.6,
          }),
        );
        art.rotation.set(-Math.PI / 2, 0, (jumble(s.id, 50) * Math.PI) / 180);
        // out past the back edge by a little, one beside the other
        art.position.set((i - 1) * 0.11 + jumble(s.id, 0.04, 8), 0.004 + k * 0.001, -0.17);
        art.castShadow = true;
        inside.add(art);
      });
  };
  return { group, fill };
}

// a page of the real album on the desk, in the desk's units
export const ALBUM_PAGE = { w: 0.48, d: 0.64, top: 0.034 };

// The real album's two pages, painted with the open spread, and shaped as the 2D album's pages
// are (3 wide to 4 high), meeting at the spine.
export function paintAlbumPages(album: THREE.Object3D, left: FaceArt, right: FaceArt): void {
  (
    [
      ["page-left", left, "right", -1],
      ["page-right", right, "left", 1],
    ] as const
  ).forEach(([name, face, spine, side]) => {
    const page = album.getObjectByName(name);
    if (!(page instanceof THREE.Mesh) || !(page.material instanceof THREE.MeshStandardMaterial))
      return;
    const box = page.geometry instanceof THREE.BoxGeometry ? page.geometry.parameters.width : 0;
    if (box > 0) page.scale.x = ALBUM_PAGE.w / box;
    page.position.x = (side * ALBUM_PAGE.w) / 2;
    replaceMap(page.material, paintedPage(face, spine));
  });
}
