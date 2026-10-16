import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Model3DViewerProps {
  width: number;
  height: number;
  angleDeg: number;
  scale: number;
  shadowIntensity: number;
  isPlaying: boolean;
  onFallback?: () => void;
}

export const Model3DViewer: React.FC<Model3DViewerProps> = ({
  width,
  height,
  angleDeg,
  scale,
  shadowIntensity,
  isPlaying,
  onFallback,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const pivotGroupRef = useRef<THREE.Group | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const animFrameIdRef = useRef<number | null>(null);
  const angleDegRef = useRef<number>(angleDeg);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    angleDegRef.current = angleDeg;
  }, [angleDeg]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera setup - framed to view Spider-Man
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    // 3. WebGL Renderer with full alpha transparency
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    // 4. Lighting setup for superhero suit pop
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 3.0);
    rimLight.position.set(-3, -2, -3);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffedd5, 1.4);
    fillLight.position.set(0, -4, 2);
    scene.add(fillLight);

    // 5. Pivot group container
    const pivotGroup = new THREE.Group();
    pivotGroupRef.current = pivotGroup;
    scene.add(pivotGroup);

    // 6. Load GLB Model
    const loader = new GLTFLoader();
    const modelPaths = ['../character.glb', 'character.glb', 'assets/character.glb'];

    let loaded = false;
    const tryLoad = (idx: number) => {
      if (idx >= modelPaths.length) {
        console.warn('[Model3DViewer] All GLB model paths failed to load. Falling back.');
        setLoadError(true);
        if (onFallback) onFallback();
        return;
      }

      loader.load(
        modelPaths[idx],
        (gltf) => {
          if (loaded) return;
          loaded = true;
          console.log(`[Model3DViewer] Successfully loaded 3D model from "${modelPaths[idx]}"!`);

          const model = gltf.scene;

          // Hide Mesh 0 (the tiny static web snippet in the original file)
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (mesh.name.includes('Material003') || mesh.name === 'Object_7') {
                mesh.visible = false;
              }
            }
          });

          // In this model, the character is upright in Y (Hips around -138 in parent matrix space, head at top)
          // In this model, scale up so Spider-Man is prominent and heroic
          model.scale.set(1.35, 1.35, 1.35);
          model.position.set(0, 0, 0);

          const orientGroup = new THREE.Group();
          orientGroup.add(model);
          orientGroup.rotation.z = Math.PI;
          // Rotate slightly around Y so we see his dynamic 3/4 front superhero pose
          orientGroup.rotation.y = 0.35;
          orientGroup.position.set(-0.1, 0.0, 0);

          pivotGroup.add(orientGroup);
          camera.position.set(0, -1.35, 4.2);
          camera.lookAt(0, -1.35, 0);

          // Play skeletal animation in place (strip large world trajectory translation on Hips)
          if (gltf.animations && gltf.animations.length > 0) {
            const clip = gltf.animations[0].clone();
            // Filter out Hips translation tracks that launch character into 60,000 units space
            clip.tracks = clip.tracks.filter((track) => !track.name.includes('.position'));
            console.log(`[Model3DViewer] Playing in-place animation "${clip.name}" (${clip.tracks.length} rotation/morph tracks)...`);

            const mixer = new THREE.AnimationMixer(model);
            mixerRef.current = mixer;
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
          }
        },
        undefined,
        (err) => {
          console.log(`[Model3DViewer] Path "${modelPaths[idx]}" failed (${err}). Trying next...`);
          tryLoad(idx + 1);
        }
      );
    };

    tryLoad(0);

    // 7. Animation render loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = Math.min(clockRef.current.getDelta(), 0.05);
      if (mixerRef.current && isPlayingRef.current) {
        mixerRef.current.update(delta);
      }

      // Dynamic 3D rotation and tilt based on sway angle
      if (pivotGroupRef.current) {
        const rad = (angleDegRef.current * Math.PI) / 180;
        pivotGroupRef.current.rotation.z = rad;
        pivotGroupRef.current.rotation.y = rad * 0.45;
        pivotGroupRef.current.rotation.x = Math.sin(rad) * 0.15;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
      if (mountRef.current) mountRef.current.replaceChildren();
    };
  }, []);

  if (loadError) return null;

  const shadowBlur = Math.round(shadowIntensity * 20);
  const shadowAlpha = (shadowIntensity * 0.55).toFixed(2);

  return (
    <div
      ref={mountRef}
      style={{
        width,
        height,
        pointerEvents: 'none',
        filter: `drop-shadow(0px ${shadowBlur}px ${shadowBlur * 1.5}px rgba(0, 0, 0, ${shadowAlpha}))`,
        transform: `scale(${scale})`,
        transformOrigin: '50% 0%',
        transition: 'filter 0.15s ease-out',
      }}
    />
  );
};
