import * as THREE from "three";

// 建筑、座椅、跑道和分道线均为真实几何体，不使用背景照片。
export function buildStadium(
  bannerText = "上海市行知中学运动会",
  onTextureLoad?: () => void,
) {
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
  const cable = material("#c4d1d8", 0.5);
  const track = material("#d38a7f");
  const laneWhite = material("#fff5ee");
  // 看台：蓝色通长条凳、浅色防滑条、墨绿色过道台阶。
  const seatBlue = material("#2f7fb6", 0.68);
  const seatNosing = material("#e7edf0", 0.7);
  const aisleGreen = material("#2f5a43", 0.74);
  const railing = new THREE.MeshStandardMaterial({
    color: "#aebcc2",
    roughness: 0.3,
    metalness: 0.35,
  });
  materials.add(railing);
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
  const vector = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z);

  // 台阶、栏杆、桁架数量多，统一用实例化网格批量绘制，保持一次绘制调用。
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(unitBox);
  const dummy = new THREE.Object3D();
  const scratchMid = new THREE.Vector3();
  const scratchDirection = new THREE.Vector3();
  const scratchQuaternion = new THREE.Quaternion();
  function boxMatrix(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    length: number,
  ) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(width, height, length);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  }
  function beamMatrix(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
  ) {
    scratchDirection.subVectors(end, start);
    const length = scratchDirection.length();
    scratchMid.addVectors(start, end).multiplyScalar(0.5);
    scratchQuaternion.setFromUnitVectors(upright, scratchDirection.normalize());
    dummy.position.copy(scratchMid);
    dummy.quaternion.copy(scratchQuaternion);
    dummy.scale.set(radius, length, radius);
    dummy.updateMatrix();
    return dummy.matrix.clone();
  }
  function instanced(
    list: THREE.Matrix4[],
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    colors?: THREE.Color[],
  ) {
    const object = new THREE.InstancedMesh(geometry, surface, list.length);
    list.forEach((matrix, index) => {
      object.setMatrixAt(index, matrix);
      if (colors) object.setColorAt(index, colors[index]);
    });
    object.instanceMatrix.needsUpdate = true;
    segment.add(object);
    return object;
  }

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

  // 看台剖面：3.4 米高的前挡墙，墙顶是带栏杆的走道，座位从走道这一层起坡。
  const halfLength = segmentLength / 2;
  const wallFront = 19.5;
  const wallBack = 20.2;
  const walkTop = 3.4;
  const seatFront = 21.9;
  const rowCount = 9;
  const rowRise = 0.42;
  const rowDepth = 0.84;
  const seatTop = walkTop + rowCount * rowRise;
  const seatBack = seatFront + rowCount * rowDepth;
  const backWallTop = seatTop + 1.9;
  const buildingHalf = 13;
  const aisleHalf = 1.15;
  const aisleCenters = [-24, 24];

  // 前挡墙与墙顶走道。
  box(
    (wallFront + wallBack) / 2,
    walkTop / 2,
    0,
    wallBack - wallFront,
    walkTop,
    segmentLength,
    concrete,
  );
  box(
    (wallBack + seatFront) / 2,
    walkTop - 0.15,
    0,
    seatFront - wallBack,
    0.3,
    segmentLength,
    fascia,
  );

  // 条凳按“蓝色踏步 + 浅色防滑条”铺满，主席台和过道处断开。
  function seatRanges(min: number, max: number) {
    const ranges: Array<[number, number]> = [];
    let cursor = min;
    for (const center of [...aisleCenters].sort((a, b) => a - b)) {
      const from = center - aisleHalf;
      const to = center + aisleHalf;
      if (to <= min || from >= max) continue;
      if (from > cursor) ranges.push([cursor, from]);
      cursor = to;
    }
    if (cursor < max) ranges.push([cursor, max]);
    return ranges;
  }
  const seatRangesList = [
    ...seatRanges(-halfLength, -buildingHalf),
    ...seatRanges(buildingHalf, halfLength),
  ];
  const aisleRangesList = aisleCenters
    .filter(
      (center) =>
        center - aisleHalf > -halfLength && center + aisleHalf < halfLength,
    )
    .map((center) => [center - aisleHalf, center + aisleHalf] as const);
  const blueSteps: THREE.Matrix4[] = [];
  const lightSteps: THREE.Matrix4[] = [];
  const greenSteps: THREE.Matrix4[] = [];
  for (let row = 0; row < rowCount; row++) {
    const top = walkTop + (row + 1) * rowRise;
    const xFront = seatFront + row * rowDepth;
    const xCenter = xFront + rowDepth / 2;
    for (const [zFrom, zTo] of seatRangesList) {
      const zCenter = (zFrom + zTo) / 2;
      const zLength = zTo - zFrom;
      blueSteps.push(
        boxMatrix(
          xFront + 0.02,
          top - rowRise / 2,
          zCenter,
          0.08,
          rowRise,
          zLength,
        ),
      );
      blueSteps.push(
        boxMatrix(xCenter, top - 0.05, zCenter, rowDepth, 0.1, zLength),
      );
      lightSteps.push(
        boxMatrix(xFront + 0.1, top + 0.01, zCenter, 0.2, 0.02, zLength),
      );
    }
    for (const [zFrom, zTo] of aisleRangesList) {
      const zCenter = (zFrom + zTo) / 2;
      const zLength = zTo - zFrom;
      greenSteps.push(
        boxMatrix(
          xFront + 0.02,
          top - rowRise / 2,
          zCenter,
          0.08,
          rowRise,
          zLength,
        ),
      );
      greenSteps.push(
        boxMatrix(xCenter, top - 0.05, zCenter, rowDepth, 0.1, zLength),
      );
      lightSteps.push(
        boxMatrix(xFront + 0.1, top + 0.01, zCenter, 0.2, 0.02, zLength),
      );
    }
  }
  instanced(blueSteps, unitBox, seatBlue);
  instanced(greenSteps, unitBox, aisleGreen);
  instanced(lightSteps, unitBox, seatNosing);

  // 座位后的背墙与看台两端挡墙，让看台从侧面看是完整建筑而不是空壳。
  box(
    seatBack + 0.35,
    backWallTop / 2,
    0,
    0.7,
    backWallTop,
    segmentLength,
    fascia,
  );
  for (const direction of [-1, 1]) {
    const z = direction * (halfLength + 0.25);
    const endBack = seatBack + 1.05;
    // 端墙随看台台阶做成阶梯状轮廓，避免出现一整面空白高墙。
    for (let row = 0; row < rowCount; row++) {
      const xFront = seatFront + row * rowDepth;
      const top = walkTop + (row + 1) * rowRise;
      box(
        (xFront + endBack) / 2,
        top / 2,
        z,
        endBack - xFront,
        top,
        0.5,
        fascia,
      );
    }
    box(
      (wallFront + seatFront) / 2,
      walkTop / 2,
      z,
      seatFront - wallFront,
      walkTop,
      0.5,
      concrete,
    );
  }
  // 墙顶走道栏杆，横贯整条看台。
  const railParts: THREE.Matrix4[] = [];
  for (let z = -halfLength + 1.2; z <= halfLength - 1.2; z += 2.6)
    railParts.push(
      beamMatrix(
        vector(19.78, walkTop, z),
        vector(19.78, walkTop + 1.1, z),
        0.028,
      ),
    );
  railParts.push(
    beamMatrix(
      vector(19.78, walkTop + 1.08, -halfLength),
      vector(19.78, walkTop + 1.08, halfLength),
      0.034,
    ),
  );
  railParts.push(
    beamMatrix(
      vector(19.78, walkTop + 0.62, -halfLength),
      vector(19.78, walkTop + 0.62, halfLength),
      0.026,
    ),
  );
  // 过道两侧的斜向扶手。
  for (const center of aisleCenters)
    for (const side of [-1, 1]) {
      const z = center + side * (aisleHalf + 0.06);
      railParts.push(
        beamMatrix(
          vector(seatFront - 0.2, walkTop + 0.95, z),
          vector(seatBack + 0.15, seatTop + 0.95, z),
          0.032,
        ),
      );
      for (let step = 1; step < 4; step++) {
        const t = step / 4;
        const x = seatFront + t * rowCount * rowDepth;
        const stepTop = walkTop + (t * rowCount + 1) * rowRise;
        railParts.push(
          beamMatrix(
            vector(x, stepTop, z),
            vector(x, stepTop + 0.95, z),
            0.024,
          ),
        );
      }
    }

  // 主席台：与第一排座位同一立面，玻璃幕墙、竖向分格与红底白字横幅。
  const controlFront = seatFront;
  const controlBack = 31.6;
  const controlTop = 9.1;
  box(
    (controlFront + controlBack) / 2,
    (walkTop + controlTop) / 2,
    0,
    controlBack - controlFront,
    controlTop - walkTop,
    buildingHalf * 2,
    fascia,
  );
  const glass = material("#416079", 0.25);
  box(controlFront - 0.06, 6.05, 0, 0.12, 3, buildingHalf * 2 - 1.6, glass);
  for (const z of [-11.5, -7.5, -3.5, 0, 3.5, 7.5, 11.5])
    box(controlFront - 0.14, 6.05, z, 0.12, 3, 0.16, fascia);
  box(controlFront - 0.14, 4.55, 0, 0.12, 0.12, buildingHalf * 2 - 1.4, fascia);
  box(controlFront - 0.14, 7.55, 0, 0.12, 0.12, buildingHalf * 2 - 1.4, fascia);
  box(
    26.75,
    controlTop + 0.15,
    0,
    controlBack - 21.7,
    0.3,
    buildingHalf * 2 + 0.6,
    fascia,
  );
  const bannerCanvas = document.createElement("canvas");
  bannerCanvas.width = 2048;
  bannerCanvas.height = 100;
  const bannerContext = bannerCanvas.getContext("2d");
  if (bannerContext) {
    bannerContext.fillStyle = "#b7352d";
    bannerContext.fillRect(0, 0, 2048, 100);
    bannerContext.fillStyle = "#fff8ea";
    bannerContext.font =
      "600 70px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    bannerContext.textAlign = "center";
    bannerContext.textBaseline = "middle";
    bannerContext.fillText(bannerText, 1024, 52);
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
  const banner = mesh(new THREE.PlaneGeometry(23.2, 1.15), bannerMaterial);
  banner.rotation.y = -Math.PI / 2;
  banner.position.set(controlFront - 0.22, 8.3, 0);
  const emblemTexture = new THREE.TextureLoader().load(
    "/school-emblem.svg",
    onTextureLoad,
  );
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
  // 沿用原版的位置：校徽位于主席台下方挡墙的正中央。
  emblem.position.set(wallFront - 0.03, 2, 0);

  // 实拍膜顶：前缘起尖、两侧落低，脊线向后下降，由底部桁架和后方桅杆承托。
  const startZ = -halfLength;
  const roofBays = 5;
  const bayLength = segmentLength / roofBays;
  const roofGap = 0.55;
  const sailHalf = (bayLength - roofGap) / 2;
  const roofFront = 16.2;
  const roofBack = 33.8;
  const roofSteel = material("#a6b1b5", 0.6);
  const roofParts: THREE.Matrix4[] = [];
  const cableParts: THREE.Matrix4[] = [];
  const sailPoints: Array<(u: number, v: number) => THREE.Vector3> = [];
  const roofBeam = (a: THREE.Vector3, b: THREE.Vector3, radius = 0.055) =>
    roofParts.push(beamMatrix(a, b, radius));
  const stay = (a: THREE.Vector3, b: THREE.Vector3) =>
    cableParts.push(beamMatrix(a, b, 0.024));

  for (let bay = 0; bay < roofBays; bay++) {
    const center = startZ + bayLength / 2 + bay * bayLength;
    const zA = center - sailHalf;
    const zB = center + sailHalf;
    const point = (u: number, v: number) => {
      // 两侧边与尖角保持直线，膜面仅在钢架之间轻微下垂。
      const ridge = 1 - Math.abs(v * 2 - 1);
      const sag = Math.sin(u * Math.PI) * ridge * (1 - ridge) * 1.4;
      return vector(
        roofFront + u * (roofBack - roofFront) - (1 - u) * ridge * 1.4,
        (1 - u) * (10.8 + ridge * 6.2) + u * (10.4 + ridge * 1.4) - sag,
        zA + v * (zB - zA),
      );
    };
    sailPoints.push(point);
    // 分开生成脊线两侧的膜面，保留尖锐轮廓，避免法线把帆顶抹成圆拱。
    const divisions = 12;
    for (const half of [0, 1]) {
      const positions: number[] = [];
      const indices: number[] = [];
      for (let iv = 0; iv <= divisions; iv++)
        for (let iu = 0; iu <= divisions; iu++) {
          const p = point(iu / divisions, (half + iv / divisions) / 2);
          positions.push(p.x, p.y, p.z);
          if (iu < divisions && iv < divisions) {
            const a = iv * (divisions + 1) + iu;
            indices.push(
              a,
              a + 1,
              a + divisions + 1,
              a + 1,
              a + divisions + 2,
              a + divisions + 1,
            );
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
    }

    // 膜下纵向檩条与横向分格，杆件始终贴合帆面。
    const under = (u: number, v: number, drop = 0.1) =>
      point(u, v).add(vector(0, -drop, 0));
    for (const v of [0, 0.25, 0.5, 0.75, 1])
      for (let step = 0; step < 8; step++)
        roofBeam(under(step / 8, v), under((step + 1) / 8, v), 0.045);
    for (const u of [0, 0.25, 0.5, 0.75, 1])
      for (let step = 0; step < 4; step++)
        roofBeam(
          under(u, step / 4),
          under(u, (step + 1) / 4),
          u === 0 ? 0.085 : 0.045,
        );

    // 主脊与两侧边梁采用有厚度的三角桁架，前端收尖，后端落在支座上。
    for (const v of [0, 0.5, 1]) {
      const trussDepth = (u: number) =>
        0.12 + 0.78 * Math.sin((u * Math.PI) / 2);
      for (let step = 0; step < 8; step++) {
        const u0 = step / 8;
        const u1 = (step + 1) / 8;
        const a = under(u0, v);
        const b = under(u1, v);
        const lowerA = under(u0, v, trussDepth(u0));
        const lowerB = under(u1, v, trussDepth(u1));
        roofBeam(a, b, 0.075);
        roofBeam(lowerA, lowerB, 0.06);
        roofBeam(a, lowerA, 0.035);
        roofBeam(
          step % 2 === 0 ? a : lowerA,
          step % 2 === 0 ? lowerB : b,
          0.04,
        );
      }
      roofBeam(under(1, v), under(1, v, trussDepth(1)), 0.035);
    }

    // 后侧人字撑把挑出的膜顶与看台背墙连为一体。
    for (const v of [0, 1]) {
      const foot = vector(roofBack - 0.4, seatTop, point(1, v).z);
      roofBeam(foot, under(1, v, 0.9), 0.13);
      roofBeam(foot, under(0.68, v, 0.65), 0.085);
    }
  }

  // 每块帆面由正后方的桅杆牵引，不跨开间交叉拉索。
  for (let bay = 0; bay < roofBays; bay++) {
    const point = sailPoints[bay];
    const z = point(1, 0.5).z;
    const foot = vector(34.2, 0, z);
    const shoulder = vector(34.4, 10.5, z);
    const top = vector(35.2, 20.2, z);
    roofBeam(foot, shoulder, 0.2);
    roofBeam(shoulder, top, 0.1);
    box(foot.x, 0.4, z, 0.9, 0.8, 0.9, concrete);
    // 主拉索沿本块帆面的脊线方向延伸；后侧两根短索只连本块后角。
    stay(top, point(0, 0.5));
    stay(top, point(1, 0));
    stay(top, point(1, 1));
    roofBeam(shoulder, point(1, 0.5), 0.09);
    stay(top, vector(40.5, 0.3, z));
  }
  instanced(roofParts, beamGeometry, roofSteel).castShadow = true;
  instanced(cableParts, beamGeometry, cable);
  instanced(railParts, beamGeometry, railing);

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
