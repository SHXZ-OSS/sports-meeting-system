import * as THREE from "three";

// 建筑、座椅、跑道和分道线均为真实几何体，不使用背景照片。
export function buildStadium(bannerText = "上海市行知中学运动会") {
  const stadium = new THREE.Group();
  const segment = new THREE.Group();
  const segmentLength = 105;
  // 半圆半径决定两条直道之间的宽度；按实拍操场收窄，避免场地显得过宽。
  const centerX = -21;
  const innerRadius = 29;
  const outerRadius = 38;
  const cameraRadius = 33;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures: THREE.Texture[] = [];
  function material(color: string, roughness = 0.8) {
    const result = new THREE.MeshStandardMaterial({ color, roughness });
    materials.add(result);
    return result;
  }
  const concrete = material("#e6e9e8");
  const fascia = material("#eef0ed");
  const steel = material("#f7f8f5", 0.5);
  const cable = material("#c4d1d8", 0.5);
  const track = material("#d38a7f");
  const laneWhite = material("#fff5ee");
  const fabric = new THREE.MeshStandardMaterial({
    color: "#fffaf0",
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  materials.add(fabric);
  function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, surface);
    object.receiveShadow = true;
    segment.add(object);
    return object;
  }
  function box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    length: number,
    surface: THREE.Material,
  ) {
    const object = mesh(new THREE.BoxGeometry(width, height, length), surface);
    object.position.set(x, y, z);
    return object;
  }
  const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  geometries.add(beamGeometry);
  const upright = new THREE.Vector3(0, 1, 0);
  function beam(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    surface = steel,
  ) {
    const object = mesh(beamGeometry, surface);
    const direction = end.clone().sub(start);
    object.position.copy(start).add(end).multiplyScalar(0.5);
    object.scale.set(radius, direction.length(), radius);
    object.quaternion.setFromUnitVectors(upright, direction.normalize());
    return object;
  }
  const vector = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z);

  // 环形跑道由两段直道和两个半圆组成，看台仅位于右侧直道。
  function oval(radius: number) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++)
      points.push(vector(centerX + radius, 0, -52.5 + (105 * i) / 16));
    for (let i = 1; i <= 96; i++) {
      const angle = (i / 96) * Math.PI;
      points.push(
        vector(
          centerX + Math.cos(angle) * radius,
          0,
          52.5 + Math.sin(angle) * radius,
        ),
      );
    }
    for (let i = 1; i <= 16; i++)
      points.push(vector(centerX - radius, 0, 52.5 - (105 * i) / 16));
    for (let i = 1; i <= 96; i++) {
      const angle = Math.PI + (i / 96) * Math.PI;
      points.push(
        vector(
          centerX + Math.cos(angle) * radius,
          0,
          -52.5 + Math.sin(angle) * radius,
        ),
      );
    }
    return points;
  }
  function strip(
    inner: number,
    outer: number,
    height: number,
    surface: THREE.Material,
  ) {
    const a = oval(inner),
      b = oval(outer);
    const positions: number[] = [],
      indices: number[] = [];
    a.forEach((point, index) => {
      positions.push(point.x, height, point.z, b[index].x, height, b[index].z);
      if (index < a.length - 1) {
        const offset = index * 2;
        indices.push(
          offset,
          offset + 1,
          offset + 2,
          offset + 1,
          offset + 3,
          offset + 2,
        );
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, surface);
  }
  const ground = mesh(new THREE.PlaneGeometry(600, 600), material("#dfe8d7"));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  track.side = THREE.DoubleSide;
  laneWhite.side = THREE.DoubleSide;
  concrete.side = THREE.DoubleSide;
  strip(innerRadius, outerRadius, 0.01, track);
  for (let lane = 0; lane <= 8; lane++)
    strip(
      innerRadius + lane * 1.12,
      innerRadius + 0.07 + lane * 1.12,
      0.025,
      laneWhite,
    );
  strip(outerRadius, outerRadius + 2.2, 0, concrete);
  // 跑道内侧铺草皮，形成带草坪的田径场。
  const infieldShape = new THREE.Shape(
    oval(innerRadius - 0.1)
      .slice(0, -1)
      .map((point) => new THREE.Vector2(point.x, -point.z)),
  );
  const infieldGeometry = new THREE.ShapeGeometry(infieldShape);
  infieldGeometry.rotateX(-Math.PI / 2);
  const infieldMaterial = material("#6f914f");
  infieldMaterial.side = THREE.DoubleSide;
  const infield = mesh(infieldGeometry, infieldMaterial);
  infield.position.y = 0;
  // 起终点线和固定间隔的横向短线；镜头沿跑道移动，这些线保持不动。
  const finishLine = mesh(
    new THREE.BoxGeometry(9, 0.02, 0.6),
    material("#fff8e8"),
  );
  finishLine.position.set(12.5, 0.045, 5);
  const halfStraight = segmentLength / 2;
  const cameraPerimeter = segmentLength * 2 + 2 * Math.PI * cameraRadius;
  // 严格按“两条直道 + 两个半圆”的体育场路径采样，不抄近道。
  function cameraPoint(distance: number, target: THREE.Vector3) {
    const arcLength = Math.PI * cameraRadius;
    const remaining =
      ((distance % cameraPerimeter) + cameraPerimeter) % cameraPerimeter;
    if (remaining < segmentLength) {
      target.set(centerX + cameraRadius, 0, halfStraight - remaining);
    } else if (remaining < segmentLength + arcLength) {
      const angle = (remaining - segmentLength) / cameraRadius;
      target.set(
        centerX + Math.cos(angle) * cameraRadius,
        0,
        -halfStraight - Math.sin(angle) * cameraRadius,
      );
    } else if (remaining < segmentLength * 2 + arcLength) {
      const offset = remaining - segmentLength - arcLength;
      target.set(centerX - cameraRadius, 0, -halfStraight + offset);
    } else {
      const angle = (remaining - segmentLength * 2 - arcLength) / cameraRadius;
      target.set(
        centerX - Math.cos(angle) * cameraRadius,
        0,
        halfStraight + Math.sin(angle) * cameraRadius,
      );
    }
  }
  const tickGeometry = new THREE.BoxGeometry(8.7, 0.02, 0.34);
  const tickMaterial = new THREE.MeshBasicMaterial({ color: "#fff8e8" });
  materials.add(tickMaterial);
  geometries.add(tickGeometry);
  const tickPoint = new THREE.Vector3();
  const tickAhead = new THREE.Vector3();
  for (let i = 0; i < 30; i++) {
    const distance = (i / 30) * cameraPerimeter;
    cameraPoint(distance, tickPoint);
    cameraPoint(distance + 0.5, tickAhead);
    const tick = new THREE.Mesh(tickGeometry, tickMaterial);
    tick.position.set(tickPoint.x, 0.04, tickPoint.z);
    tick.rotation.y = Math.atan2(
      tickAhead.x - tickPoint.x,
      tickAhead.z - tickPoint.z,
    );
    segment.add(tick);
  }
  // 阶梯、挡墙与沿看台纵深延伸的座椅。
  const front = 20,
    startZ = -segmentLength / 2,
    length = segmentLength,
    rowCount = 7;
  box(26.3, 0.5, 0, 13.4, 1, 105, fascia);
  for (let row = 0; row < rowCount; row++) {
    const height = 0.9 + row * 0.39;
    box(
      front + row * 0.91 + 0.455,
      height / 2,
      0,
      0.91,
      height,
      length,
      concrete,
    );
    box(
      front + row * 0.91 + 0.45,
      height + 0.035,
      0,
      0.89,
      0.07,
      length,
      fascia,
    );
  }
  box(27.4, 2.3, 0, 1.2, 4.6, length, fascia);
  box(19.7, 0.6, 0, 0.3, 1.2, length, fascia);
  const seatMaterial = material("#68b4df", 0.6);
  const seatGeometry = new THREE.BoxGeometry(0.48, 0.1, 0.52);
  const backGeometry = new THREE.BoxGeometry(0.09, 0.43, 0.52);
  geometries.add(seatGeometry);
  geometries.add(backGeometry);
  const seats: THREE.Matrix4[] = [],
    backs: THREE.Matrix4[] = [];
  const transform = new THREE.Object3D();
  for (let row = 0; row < rowCount; row++) {
    for (let seat = 0; seat < 150; seat++) {
      if (seat % 25 < 3) continue;
      const x = front + row * 0.91 + 0.49,
        z = startZ + 0.35 + seat * 0.7;
      if (z > -13 && z < 13) continue;
      const y = 0.9 + row * 0.39;
      transform.position.set(x, y + 0.28, z);
      transform.updateMatrix();
      seats.push(transform.matrix.clone());
      transform.position.set(x + 0.24, y + 0.51, z);
      transform.rotation.z = -0.12;
      transform.updateMatrix();
      backs.push(transform.matrix.clone());
      transform.rotation.z = 0;
    }
  }
  const seatInstances = new THREE.InstancedMesh(
    seatGeometry,
    seatMaterial,
    seats.length,
  );
  const backInstances = new THREE.InstancedMesh(
    backGeometry,
    seatMaterial,
    backs.length,
  );
  seats.forEach((matrix, index) => {
    seatInstances.setMatrixAt(index, matrix);
    backInstances.setMatrixAt(index, backs[index]);
    const color = new THREE.Color(index % 4 === 0 ? "#a4d4eb" : "#69a9d1");
    seatInstances.setColorAt(index, color);
    backInstances.setColorAt(index, color);
  });
  segment.add(seatInstances, backInstances);
  for (const x of [19.6, 31.8]) {
    const base = x > 30 ? 5.6 : 1.1;
    for (let z = startZ; z < startZ + length; z += 3.5)
      beam(vector(x, base, z), vector(x, base + 1.1, z), 0.035);
    for (const rise of [0.2, 0.65, 1.1])
      beam(
        vector(x, base + rise, startZ),
        vector(x, base + rise, startZ + length),
        0.035,
      );
  }

  // 主席台：看台正中独立的双层建筑，玻璃控制室与红底白字横幅。
  const glass = material("#416079", 0.25);
  const mainHalfWidth = 13;
  const mainDepth = mainHalfWidth * 2;
  box(25.6, 3.5, 0, 10.8, 7, mainDepth, fascia);
  box(20.6, 1.4, 0, 0.8, 2.8, mainDepth, fascia);
  box(20.15, 4.1, 0, 0.2, 2.4, mainDepth - 1.6, glass);
  for (const z of [-12, -8, -4, 0, 4, 8, 12])
    box(20.04, 4.1, z, 0.12, 2.5, 0.16, fascia);
  box(20.04, 2.9, 0, 0.12, 0.1, mainDepth - 1.4, fascia);
  box(20.04, 5.3, 0, 0.12, 0.1, mainDepth - 1.4, fascia);
  const bannerCanvas = document.createElement("canvas");
  bannerCanvas.width = 2048;
  bannerCanvas.height = 84;
  const bannerContext = bannerCanvas.getContext("2d");
  if (bannerContext) {
    bannerContext.fillStyle = "#b7352d";
    bannerContext.fillRect(0, 0, 2048, 84);
    bannerContext.fillStyle = "#fff8ea";
    bannerContext.font =
      "600 64px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    bannerContext.textAlign = "center";
    bannerContext.textBaseline = "middle";
    bannerContext.fillText(bannerText, 1024, 44);
  }
  const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
  bannerTexture.colorSpace = THREE.SRGBColorSpace;
  bannerTexture.anisotropy = 4;
  textures.push(bannerTexture);
  const bannerMaterial = new THREE.MeshBasicMaterial({
    map: bannerTexture,
    side: THREE.DoubleSide,
  });
  materials.add(bannerMaterial);
  const banner = mesh(new THREE.PlaneGeometry(23.2, 0.95), bannerMaterial);
  banner.rotation.y = -Math.PI / 2;
  banner.position.set(20.0, 5.95, 0);
  box(25.6, 7.15, 0, 11, 0.25, mainDepth + 0.4, fascia);
  const emblemTexture = new THREE.TextureLoader().load("/school-emblem.svg");
  emblemTexture.colorSpace = THREE.SRGBColorSpace;
  emblemTexture.anisotropy = 4;
  textures.push(emblemTexture);
  const emblemMaterial = new THREE.MeshBasicMaterial({
    map: emblemTexture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  materials.add(emblemMaterial);
  const emblem = mesh(new THREE.PlaneGeometry(1.6, 1.6), emblemMaterial);
  emblem.rotation.y = -Math.PI / 2;
  emblem.position.set(19.95, 2, 0);

  // 张拉膜顶：每个开间中央起峰，白色钢桁架支撑。
  const roofBays = 9;
  const bayLength = length / roofBays;
  const mainBay = Math.floor(roofBays / 2);
  function roofPoint(u: number, v: number, center: number, lift = 0) {
    const peak = 1 - (2 * v - 1) ** 2;
    const y =
      (7.5 + 5 * peak) * (1 - u) +
      (7.2 + 1.2 * peak) * u -
      Math.sin(u * Math.PI) * 0.5 +
      lift;
    return vector(14.8 + u * 19, y, center + (v - 0.5) * bayLength);
  }
  function roofCurve(points: THREE.Vector3[], radius: number) {
    mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        28,
        radius,
        5,
        false,
      ),
      steel,
    );
  }
  for (let bay = 0; bay < roofBays; bay++) {
    const center = startZ + bayLength / 2 + bay * bayLength;
    const lift = bay === mainBay ? 0.9 : 0;
    const positions: number[] = [],
      indices: number[] = [];
    const segments = 22;
    for (let v = 0; v <= segments; v++) {
      for (let u = 0; u <= segments; u++) {
        const point = roofPoint(u / segments, v / segments, center, lift);
        positions.push(point.x, point.y, point.z);
        if (u < segments && v < segments) {
          const a = v * (segments + 1) + u;
          indices.push(
            a,
            a + 1,
            a + segments + 1,
            a + 1,
            a + segments + 2,
            a + segments + 1,
          );
        }
      }
    }
    const roofGeometry = new THREE.BufferGeometry();
    roofGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    roofGeometry.setIndex(indices);
    roofGeometry.computeVertexNormals();
    mesh(roofGeometry, fabric).castShadow = true;
    for (const u of [0, 0.5, 1])
      roofCurve(
        Array.from({ length: 23 }, (_, i) =>
          roofPoint(u, i / 22, center, lift),
        ),
        u === 0.5 ? 0.02 : 0.055,
      );
    for (const v of [0, 1])
      roofCurve(
        Array.from({ length: 23 }, (_, i) =>
          roofPoint(i / 22, v, center, lift),
        ),
        0.06,
      );
    const z = center;
    // 主席台正前方不设雨棚立柱，避免挡住正面机位。
    if (bay !== mainBay) {
      beam(vector(16.8, 0, z), vector(16.2, 13.2 + lift, z), 0.14).castShadow =
        true;
    }
    beam(vector(33.3, 4.8, z), vector(33.8, 9.2 + lift, z), 0.1);
    beam(
      vector(16.2, 12.9 + lift, z),
      roofPoint(0, 0.5, center, lift),
      0.026,
      cable,
    );
    beam(
      vector(16.2, 12.9 + lift, z),
      roofPoint(1, 0, center, lift),
      0.035,
      cable,
    );
    beam(vector(16.4, 9.2 + lift, z), roofPoint(0, 0, center, lift), 0.07);
    for (const direction of [-1, 1])
      beam(
        vector(16.2, 8.5 + lift, z + direction * bayLength * 0.32),
        vector(16.2, 9.8 + lift, z - direction * bayLength * 0.32),
        0.03,
        steel,
      );
    beam(
      vector(16.2, 8.5 + lift, z - bayLength / 2),
      vector(16.2, 8.5 + lift, z + bayLength / 2),
      0.035,
      steel,
    );
    if (bay !== mainBay) {
      box(16.8, 0.15, z, 0.55, 0.3, 0.55, fascia);
    }
  }
  // 看台有明确的端部，跑道保持完整一圈。
  beam(vector(16.8, 0, 52.5), vector(16.2, 13.2, 52.5), 0.14);
  beam(vector(33.3, 4.8, 52.5), vector(33.8, 9.2, 52.5), 0.1);
  stadium.add(segment);
  return {
    stadium,
    cameraPoint,
    centerX,
    cameraPerimeter,
    grandstandLength: segmentLength,
    dispose() {
      stadium.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      textures.forEach((texture) => texture.dispose());
    },
  };
}
