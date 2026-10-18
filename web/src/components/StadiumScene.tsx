import { useEffect, useRef } from "react";

export type StadiumShot = "ambient" | "podium" | "overview";

// 各机位的镜头参数：成绩公布停在主席台，收尾拉到全场总览。
const SHOT_DURATION: Record<StadiumShot, number> = {
  ambient: 3.0,
  podium: 2.4,
  overview: 3.0,
};
const SHOT_FOV: Record<StadiumShot, number> = {
  ambient: 42,
  podium: 42,
  overview: 56,
};
const SHOT_FOG: Record<StadiumShot, { near: number; far: number }> = {
  ambient: { near: 65, far: 150 },
  podium: { near: 65, far: 150 },
  overview: { near: 220, far: 600 },
};

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// 公开看板的动态体育场背景：只负责场景与镜头，不接管任何看板 UI。
export default function StadiumScene({
  eventName,
  shot = "ambient",
}: {
  eventName?: string;
  shot?: StadiumShot;
}) {
  const host = useRef<HTMLDivElement>(null);
  const shotRef = useRef(shot);
  const requestDrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    shotRef.current = shot;
    requestDrawRef.current?.();
  }, [shot]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([import("three"), import("./buildStadium")])
      .then(([THREE, { buildStadium }]) => {
        if (disposed) return;
        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          });
        } catch {
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.style.display = "block";
        container.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#e7f3fc");
        const fog = new THREE.Fog("#f4f9fc", 65, 150);
        scene.fog = fog;
        scene.add(new THREE.HemisphereLight("#eff8ff", "#d6c6b3", 2.8));
        const sun = new THREE.DirectionalLight("#fff8ea", 3.2);
        sun.position.set(-20, 45, 5);
        sun.target.position.set(24, 2, -26);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        Object.assign(sun.shadow.camera, {
          left: -70,
          right: 70,
          top: 70,
          bottom: -70,
          far: 180,
        });
        sun.shadow.normalBias = 0.08;
        scene.add(sun, sun.target);
        const { stadium, cameraPoint, centerX, dispose } = buildStadium(
          `上海市行知中学${eventName?.trim() || "运动会"}`,
        );
        scene.add(stadium);
        const camera = new THREE.PerspectiveCamera(
          SHOT_FOV.ambient,
          1,
          0.1,
          500,
        );
        const cameraSpeed = 12;
        const startDistance = 35;
        const trackCenter = new THREE.Vector3(centerX, 0, 0);
        const trackPoint = new THREE.Vector3();
        const aheadPoint = new THREE.Vector3();
        const direction = new THREE.Vector3();
        const inward = new THREE.Vector3();
        const ambientPosition = new THREE.Vector3();
        const ambientLook = new THREE.Vector3();
        // 成绩动画机位：停在主席台正前方，正面看向横幅。
        const podiumPosition = new THREE.Vector3(-12, 5.2, 0);
        const podiumLook = new THREE.Vector3(20, 5.3, 0);
        // 收尾总览机位：高位斜看整条跑道、看台和主席台。
        const overviewPosition = new THREE.Vector3(-100, 28, 90);
        const overviewLook = new THREE.Vector3(-18, 6, -8);
        const targetPosition = new THREE.Vector3();
        const targetLook = new THREE.Vector3();
        const lookPosition = new THREE.Vector3();
        const transitionStartPosition = new THREE.Vector3();
        const transitionStartLook = new THREE.Vector3();
        let activeShot: StadiumShot = "ambient";
        let transitionProgress = 1;
        let transitionStartFov = SHOT_FOV.ambient;
        let transitionStartFogNear = SHOT_FOG.ambient.near;
        let transitionStartFogFar = SHOT_FOG.ambient.far;
        let hasPose = false;

        function computeAmbientPose(seconds: number) {
          const distance = startDistance + seconds * cameraSpeed;
          cameraPoint(distance, trackPoint);
          cameraPoint(distance + 28, aheadPoint);
          direction.subVectors(aheadPoint, trackPoint).normalize();
          inward
            .set(trackCenter.x - trackPoint.x, 0, trackCenter.z - trackPoint.z)
            .normalize();
          ambientPosition
            .copy(trackPoint)
            .addScaledVector(direction, -24)
            .addScaledVector(inward, 16);
          ambientPosition.y = 4;
          ambientLook.copy(aheadPoint).addScaledVector(inward, -2);
          ambientLook.y = 2;
        }

        function resolveShotPose(shot: StadiumShot) {
          if (shot === "podium") {
            targetPosition.copy(podiumPosition);
            targetLook.copy(podiumLook);
          } else if (shot === "overview") {
            targetPosition.copy(overviewPosition);
            targetLook.copy(overviewLook);
          } else {
            computeAmbientPose(elapsed);
            targetPosition.copy(ambientPosition);
            targetLook.copy(ambientLook);
          }
        }

        function applyShot(delta: number, instant: boolean) {
          const requested = shotRef.current;
          if (requested !== activeShot) {
            // 从当前画面位置接着走，避免中途切换机位时跳帧。
            transitionStartPosition.copy(camera.position);
            transitionStartLook.copy(lookPosition);
            transitionStartFov = camera.fov;
            transitionStartFogNear = fog.near;
            transitionStartFogFar = fog.far;
            activeShot = requested;
            transitionProgress = instant ? 1 : 0;
          }
          if (transitionProgress < 1) {
            transitionProgress = Math.min(
              1,
              transitionProgress + delta / SHOT_DURATION[activeShot],
            );
          }
          resolveShotPose(activeShot);
          const eased = smoothstep(transitionProgress);
          if (transitionProgress < 1 && hasPose) {
            camera.position.lerpVectors(
              transitionStartPosition,
              targetPosition,
              eased,
            );
            lookPosition.lerpVectors(transitionStartLook, targetLook, eased);
            camera.fov =
              transitionStartFov +
              (SHOT_FOV[activeShot] - transitionStartFov) * eased;
            fog.near =
              transitionStartFogNear +
              (SHOT_FOG[activeShot].near - transitionStartFogNear) * eased;
            fog.far =
              transitionStartFogFar +
              (SHOT_FOG[activeShot].far - transitionStartFogFar) * eased;
            camera.updateProjectionMatrix();
          } else {
            camera.position.copy(targetPosition);
            lookPosition.copy(targetLook);
            if (camera.fov !== SHOT_FOV[activeShot]) {
              camera.fov = SHOT_FOV[activeShot];
              camera.updateProjectionMatrix();
            }
            fog.near = SHOT_FOG[activeShot].near;
            fog.far = SHOT_FOG[activeShot].far;
          }
          camera.lookAt(lookPosition);
          hasPose = true;
        }

        let frame = 0;
        let elapsed = 0;
        let lastTick: number | undefined;
        let contextLost = false;
        let boostTarget = 0;
        let boost = 0;
        let holdTimer: number | undefined;
        let holdX = 0;
        let holdY = 0;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const releasePress = () => {
          if (holdTimer !== undefined) {
            window.clearTimeout(holdTimer);
            holdTimer = undefined;
          }
          boostTarget = 0;
        };
        // 长按 220ms 后加速镜头，松开或移动超过 10px 即恢复。
        const onPointerDown = (event: PointerEvent) => {
          if (
            event.button !== 0 ||
            motion.matches ||
            activeShot !== "ambient"
          ) {
            return;
          }
          holdX = event.clientX;
          holdY = event.clientY;
          if (holdTimer !== undefined) window.clearTimeout(holdTimer);
          holdTimer = window.setTimeout(() => {
            holdTimer = undefined;
            boostTarget = 1;
          }, 220);
        };
        const onPointerMove = (event: PointerEvent) => {
          if (holdTimer === undefined && boostTarget === 0) return;
          if (Math.hypot(event.clientX - holdX, event.clientY - holdY) > 10) {
            releasePress();
          }
        };
        function draw() {
          applyShot(0, motion.matches);
          renderer.render(scene, camera);
        }
        function resize() {
          if (!container || contextLost) return;
          const { width, height } = container.getBoundingClientRect();
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          draw();
        }
        function tick(time: number) {
          if (lastTick !== undefined) {
            const delta = Math.min((time - lastTick) / 1000, 0.1);
            if (activeShot === "ambient" && transitionProgress >= 1) {
              boost += (boostTarget - boost) * Math.min(1, delta * 10);
              elapsed += delta * (1 + boost * 4);
            }
            applyShot(delta, false);
            renderer.render(scene, camera);
          } else {
            draw();
          }
          lastTick = time;
          frame = window.requestAnimationFrame(tick);
        }
        function syncMotion() {
          window.cancelAnimationFrame(frame);
          lastTick = undefined;
          if (document.hidden) releasePress();
          if (contextLost) return;
          if (!document.hidden && !motion.matches)
            frame = window.requestAnimationFrame(tick);
          else draw();
        }
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        window.addEventListener("pointerdown", onPointerDown, {
          passive: true,
        });
        window.addEventListener("pointermove", onPointerMove, {
          passive: true,
        });
        window.addEventListener("pointerup", releasePress, { passive: true });
        window.addEventListener("pointercancel", releasePress, {
          passive: true,
        });
        window.addEventListener("blur", releasePress);
        document.addEventListener("visibilitychange", syncMotion);
        motion.addEventListener("change", syncMotion);
        const onContextLost = (event: Event) => {
          event.preventDefault();
          contextLost = true;
          window.cancelAnimationFrame(frame);
          renderer.domElement.style.opacity = "0";
        };
        const onContextRestored = () => {
          contextLost = false;
          renderer.domElement.style.opacity = "1";
          resize();
          syncMotion();
        };
        renderer.domElement.addEventListener("webglcontextlost", onContextLost);
        renderer.domElement.addEventListener(
          "webglcontextrestored",
          onContextRestored,
        );
        requestDrawRef.current = draw;
        resize();
        syncMotion();
        cleanup = () => {
          window.cancelAnimationFrame(frame);
          releasePress();
          requestDrawRef.current = null;
          observer.disconnect();
          window.removeEventListener("pointerdown", onPointerDown);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", releasePress);
          window.removeEventListener("pointercancel", releasePress);
          window.removeEventListener("blur", releasePress);
          document.removeEventListener("visibilitychange", syncMotion);
          motion.removeEventListener("change", syncMotion);
          renderer.domElement.removeEventListener(
            "webglcontextlost",
            onContextLost,
          );
          renderer.domElement.removeEventListener(
            "webglcontextrestored",
            onContextRestored,
          );
          dispose();
          sun.shadow.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        /* WebGL 不可用时保留看板原本的深色背景。 */
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [eventName]);
  return (
    <div
      ref={host}
      className="stadium-scene"
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    />
  );
}
