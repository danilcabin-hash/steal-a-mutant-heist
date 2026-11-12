import * as T from 'three';

export function createMeme(index: number, color: string, accent: string) {
  const group = new T.Group();
  const body = new T.MeshStandardMaterial({ color, roughness: 0.85 });
  const trim = new T.MeshStandardMaterial({ color: accent, roughness: 0.75 });
  const dark = new T.MeshStandardMaterial({ color: '#272040' });
  const white = new T.MeshStandardMaterial({ color: '#fff6e5' });
  const cube = new T.BoxGeometry();
  const cylinder = new T.CylinderGeometry(0.5, 0.55, 1, 10);

  function part(mat: T.Material, x: number, y: number, z: number,
    w: number, h: number, d: number, geometry: T.BufferGeometry = cube) {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    group.add(mesh);
    return mesh;
  }

  if (index === 0) {
    part(body, 0, 0.98, 0, 0.83, 1.5, 0.63, cylinder);
    part(trim, 0, 1.73, 0, 0.80, 0.05, 0.62, cylinder);
    for (const x of [-0.53, 0.53]) {
      part(body, x, 0.91, 0, 0.16, 0.58, 0.19);
      part(trim, x / 3, 0.12, 0.08, 0.22, 0.24, 0.37);
    }
    part(trim, -0.23, 1.08, 0.25, 0.08, 0.48, 0.05);
  } else if (index === 1) {
    part(trim, 0, 0.23, 0.11, 1.12, 0.44, 0.91);
    part(body, 0, 0.78, 0, 0.82, 0.81, 0.63);
    for (const x of [-0.26, 0.26]) {
      part(body, x, 1.22, 0, 0.24, 0.28, 0.28).rotation.z = -x;
    }
  } else {
    part(body, 0, 0.45, -0.15, 0.74, 0.62, 0.83);
    part(body, 0, 0.92, 0.16, 0.37, 0.92, 0.40);
    part(body, 0, 1.35, 0.18, 0.53, 0.38, 0.53);
    part(trim, 0, 0.56, -0.55, 0.85, 0.15, 0.19);
    part(trim, 0, 1.25, 0.49, 0.33, 0.13, 0.23);
  }
  const eyeY = index === 1 ? 0.91 : 1.4;
  for (const x of [-0.12, 0.12]) {
    part(white, x, eyeY, index === 2 ? 0.44 : 0.32, 0.15, 0.16, 0.08);
    part(dark, x + 0.025, eyeY - 0.011, index === 2 ? 0.49 : 0.38, 0.062, 0.088, 0.05);
  }
  if (index < 2) part(dark, 0, eyeY - 0.2, 0.34, 0.16, 0.045, 0.065);
  return group;
}
