import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioReactiveStore } from "@/stores/useAudioReactiveStore";
import { ShaderType } from "@/types/shader";
import { hexToRgb01 } from "@/utils/colorHex";

/** Shared color grade for all desktop wallpaper shader variants. */
const SHADER_GRADE_GLSL = `
uniform vec3 uTint;
uniform float uTintMix;
uniform float uSaturation;
vec3 gradeDesktopShaderRgb(vec3 c) {
  vec3 tinted = mix(c, c * uTint, clamp(uTintMix, 0.0, 1.0));
  float luma = dot(tinted, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luma), tinted, clamp(uSaturation, 0.0, 2.0));
}
`;

// Re-export for backwards compatibility
export { ShaderType };

interface GalaxyBackgroundProps {
  shaderType?: ShaderType;
  /** When true, render regardless of the global shaderEffectEnabled setting */
  forceRender?: boolean;
}

const GalaxyBackground: React.FC<GalaxyBackgroundProps> = ({
  shaderType = ShaderType.GALAXY,
  forceRender = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(new THREE.Clock()); // Use Clock for time uniform
  const shaderEffectEnabled = useDisplaySettingsStore((state) => state.shaderEffectEnabled);

  // Combined state for rendering condition - removed screen size check
  const shouldRender = forceRender || shaderEffectEnabled;

  // Check initial screen width and add resize listener - REMOVED
  // useEffect(() => {
  //   const checkScreenWidth = () => {
  //     // Use a common breakpoint like 768px (Tailwind 'md') or 640px ('sm')
  //     setIsLargeScreen(window.innerWidth >= 640); // Update screen size state
  //   };
  //
  //   checkScreenWidth(); // Initial check
  //   window.addEventListener('resize', checkScreenWidth);
  //
  //   return () => window.removeEventListener('resize', checkScreenWidth);
  // }, []);

  useEffect(() => {
    if (!shouldRender || !mountRef.current) return;

    const currentMount = mountRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); // Orthographic for fullscreen shader

    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Disabled for performance
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    // Capped pixel ratio for better performance
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    currentMount.appendChild(renderer.domElement);

    // --- Common Vertex Shader ---
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    // --- Fragment Shader Selection ---
    let fragmentShader: string;
    const customUniforms: { [uniform: string]: { value: unknown } } = {
      resolution: {
        value: new THREE.Vector2(
          currentMount.clientWidth,
          currentMount.clientHeight
        ),
      },
      time: { value: 0.0 },
      beat: { value: 0.0 },
      energy: { value: 0.0 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uTintMix: { value: 0.0 },
      uSaturation: { value: 1.0 },
    };

    // Select shader based on type
    switch (shaderType) {
      case ShaderType.NEBULA:
        fragmentShader = `
          uniform vec2 resolution;
          uniform float time;
          varying vec2 vUv;
          ${SHADER_GRADE_GLSL}

          void main() {
            vec4 O = vec4(0.0);
            vec2 a = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;
            a.x *= resolution.x / resolution.y;
            
            // --- Adjust center offset here ---
            vec2 centerOffset = vec2(-0.5, -0.5); // Increase values to shift more top-right
            a += centerOffset;
            // --- End adjustment ---
            
            float f = time;
            float m = 0.0;
            float x = 0.0;

            for (O *= m; m < 170.; O += .0007 / (abs(length(
              a + abs(sin(m * mix(.02, .07, sin(f) * .5 + .5) - f))
              * vec2(cos(x = m * .05 - f), sin(x))) - .5) + .02)
              * (1. + cos(m++ * .1 + length(a) * 6. - f + vec4(0, 1, 2, 0))));

            vec4 outc = O * 0.8;
            outc.rgb = gradeDesktopShaderRgb(outc.rgb);
            gl_FragColor = outc;
          }
        `;
        break;

      case ShaderType.AURORA:
        fragmentShader = `
          uniform vec2 resolution;
          uniform float time;
          varying vec2 vUv;
          ${SHADER_GRADE_GLSL}
          
          // Simple hash function for noise approximation
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }
          
          void mainImage(out vec4 O, vec2 F) {
            vec3 A = vec3(resolution.x, resolution.y, 0.0);
            vec3 p;
            float u = 0.0, R = 0.0, o = 0.0, r = 0.0, a = time;
          
            // --- Adjust center offset here ---
            // Offset in normalized screen coords (-1 to 1). 
            // Positive values shift center right/up.
            vec2 centerOffset = vec2(-0.5, -0.5); // Start with no offset
            // --- End adjustment ---

            for (O *= u; u++ < 44.;) {
              // Apply offset to the coordinate calculation before normalization
              vec2 centeredF = F + F - A.xy + centerOffset * A.xy; 
              p = R * normalize(vec3(centeredF, A.y));
              
              p.z -= 2.; 
              r = length(p); 
              p /= r*.1;
              
              p.xz *= mat2(cos(a*.2 + vec4(0,33,11,0)));
              
              // Mathematical approximation instead of texture
              float noise = hash(F/1024.0 + vec2(cos(time*0.1), sin(time*0.1))) * 0.1;
              R += o = min(r - .3, noise) + .1;
              
              O += .05 / (.4 + o) 
                   * mix(smoothstep(.5,.7,sin(p.x+cos(p.y)*cos(p.z))*sin(p.z+sin(p.y)*cos(p.x+a))), 
                        1., .15/r/r) 
                   * smoothstep(5., 0., r)
                   * (1. + cos(R*3. + vec4(0,1,2,0)));
            }
          }
          
          void main() {
            vec4 fragColor = vec4(0.0);
            mainImage(fragColor, gl_FragCoord.xy);
            fragColor *= 0.4;
            fragColor.rgb = gradeDesktopShaderRgb(fragColor.rgb);
            gl_FragColor = fragColor;
          }
        `;
        break;
      case ShaderType.PINK_TRAIL_AURORA:
        fragmentShader = `
          uniform vec2 resolution;
          uniform float time;
          uniform float beat;
          uniform float energy;
          varying vec2 vUv;
          ${SHADER_GRADE_GLSL}

          float hash(float n) {
            return fract(sin(n) * 43758.5453123);
          }

          float hash21(vec2 p) {
            return fract(sin(dot(p, vec2(27.619, 57.583))) * 43758.5453);
          }

          float sparkleTrail(vec2 uv, float t, float strength) {
            float total = 0.0;
            for (int i = 0; i < 18; i++) {
              float fi = float(i);
              float lane = fi / 17.0;
              float phase = t * (0.9 + lane * 1.8) + fi * 3.1;
              vec2 head = vec2(
                fract(phase * 0.18 + hash(fi * 11.7)),
                0.18 + lane * 0.7 + 0.06 * sin(phase * 1.9 + fi)
              );
              vec2 rel = uv - head;
              rel.x *= 1.9;
              float trail = exp(-max(0.0, rel.x) * (18.0 + strength * 30.0));
              float core = exp(-dot(rel, rel) * (350.0 + strength * 620.0));
              float twinkle = 0.65 + 0.35 * sin(t * 20.0 + fi * 7.3);
              total += (trail * 0.22 + core) * twinkle;
            }
            return total;
          }

          void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec2 p = uv * 2.0 - 1.0;
            p.x *= resolution.x / resolution.y;

            float t = time * (0.35 + energy * 0.3);
            float beatPulse = smoothstep(0.08, 0.95, beat);

            float waveA = sin(p.x * 3.6 + t * 2.2 + sin(p.y * 4.1 + t));
            float waveB = sin((p.x + p.y * 0.45) * 6.1 - t * 2.7);
            float waveC = sin(p.x * 8.7 + t * 4.0 + waveB * 0.8);
            float ridge = smoothstep(0.12, 0.96, abs(waveA * 0.65 + waveB * 0.35));

            float band = 0.38 + 0.62 * ridge + 0.22 * waveC;
            band += beatPulse * 0.18;

            vec3 deepPink = vec3(0.22, 0.03, 0.20);
            vec3 auroraPink = vec3(0.92, 0.26, 0.74);
            vec3 hotPink = vec3(1.00, 0.48, 0.83);
            vec3 color = mix(deepPink, auroraPink, clamp(band, 0.0, 1.0));
            color = mix(color, hotPink, pow(max(band, 0.0), 1.8) * (0.45 + beatPulse * 0.5));

            float sparkleStrength = 0.2 + energy * 0.35 + beatPulse * 1.2;
            float trail = sparkleTrail(uv, time, sparkleStrength);
            float grain = hash21(uv * resolution.xy * 0.6 + time) * 0.04;
            vec3 sparkleColor = vec3(1.0, 0.85, 0.98);
            color += sparkleColor * trail * (0.15 + beatPulse * 0.95);
            color += grain;

            float vignette = smoothstep(1.25, 0.2, length(p));
            color *= vignette * (0.78 + beatPulse * 0.22);

            color = gradeDesktopShaderRgb(color);
            gl_FragColor = vec4(color, 1.0);
          }
        `;
        break;

      case ShaderType.GALAXY:
      default:
        fragmentShader = `
          uniform vec2 resolution;
          uniform float time;
          varying vec2 vUv;
          ${SHADER_GRADE_GLSL}

          mat3 rotate3D(float angle, vec3 axis) {
              axis = normalize(axis);
              float s = sin(angle);
              float c = cos(angle);
              float oc = 1.0 - c;

              return mat3(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                          oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                          oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c);
          }

          void main() {
              vec2 r = resolution.xy;
              vec2 FC = gl_FragCoord.xy;
              float t = time;
              vec3 o = vec3(0.0);

              for(float i=0.0,g=0.0,e=0.0,s=0.0; ++i<99.;o+=vec3(s/8e2)){
                vec3 p=vec3((FC.xy-.5*r)/r.y*1.3+vec2(2.8,-.4),g-6.)*rotate3D(sin(t*.5)*.1-3.,vec3(2,40,-7));
                s=3.;
                for(int j=0; j++<16; p=vec3(0,4,-1)-abs(abs(p)*e-vec3(3,4,3))){
                  s*=e=7.5/abs(dot(p,p*(.55+cos(t)*.005)+.3));
                }
                g+=p.y/s-.0015;
                s=log2(s)-g*.5;
              }

              float dimFactor = 0.4;
              vec3 rgb = gradeDesktopShaderRgb(o * dimFactor);
              gl_FragColor = vec4(rgb, 1.0);
          }
        `;
    }

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: customUniforms,
      vertexShader,
      fragmentShader,
    });

    // Fullscreen Quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(quad);
    // --- End Shader Setup ---

    // Handle resize
    const handleResize = () => {
      if (!currentMount) return;
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      renderer.setSize(width, height);
      shaderMaterial.uniforms.resolution.value.set(width, height);
      // No camera update needed for orthographic fullscreen quad
    };
    window.addEventListener("resize", handleResize);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Update time uniform
      shaderMaterial.uniforms.time.value = clockRef.current.getElapsedTime();
      const { beat, energy } = useAudioReactiveStore.getState();
      shaderMaterial.uniforms.beat.value = Math.min(1, beat);
      shaderMaterial.uniforms.energy.value = Math.min(1, energy);

      const ds = useDisplaySettingsStore.getState();
      const [tr, tg, tb] = hexToRgb01(ds.desktopShaderTintHex);
      shaderMaterial.uniforms.uTint.value.set(tr, tg, tb);
      shaderMaterial.uniforms.uTintMix.value = ds.desktopShaderTintMix;
      shaderMaterial.uniforms.uSaturation.value = ds.desktopShaderSaturation;

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      if (currentMount && renderer.domElement) {
        currentMount.removeChild(renderer.domElement);
      }
      // Dispose Three.js objects
      scene.remove(quad);
      geometry.dispose();
      shaderMaterial.dispose();
      renderer.dispose();
    };
  }, [shouldRender, shaderType]); // Re-run effect if rendering condition or shader type changes

  // Conditionally render the container div
  return shouldRender ? (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: -1,
      }}
    />
  ) : null; // Render nothing if condition not met
};

export default GalaxyBackground;
