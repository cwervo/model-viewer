/*
 * Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {BufferAttribute, BufferGeometry, LinearEncoding, Mesh, NearestFilter, NoBlending, OrthographicCamera, RawShaderMaterial, Scene, Texture, WebGLRenderer, WebGLRenderTarget} from 'three';

import {encodings, getDirectionChunk, texelIO} from './shader-chunk/common.glsl.js';
import {bilinearCubeUVChunk} from './shader-chunk/cube_uv_reflection_fragment.glsl.js';

const LOD_MIN = 3;
const LOD_MAX = 8;
const SIZE_MAX = Math.pow(2, LOD_MAX);
const EXTRA_LOD_ROUGHNESS = [0.5, 0.7, 1.0];
const TOTAL_LODS = LOD_MAX - LOD_MIN + 1 + EXTRA_LOD_ROUGHNESS.length;
const MAX_SAMPLES = 20;

const $roughness = Symbol('roughness');
const $sigma = Symbol('sigma');
const $lodSize = Symbol('lodSize');
const $lodPlanes = Symbol('lodPlanes');
const $blurShader = Symbol('blurShader');
const $flatCamera = Symbol('flatCamera');
const $equirectangularToCubeUV = Symbol('equirectangularToCubeUV');
const $applyPMREM = Symbol('applyPMREM');
const $gaussianBlur = Symbol('gaussianBlur');

/**
 * This class generates a Prefiltered, Mipmapped Radiance Environment Map
 * (PMREM) from a cubeMap environment texture. This allows different levels of
 * blur to be quickly accessed based on material roughness. It is packed into a
 * special CubeUV format that allows us to perform custom interpolation so that
 * we can support nonlinear formats such as RGBE. Unlike a traditional mipmap
 * chain, it only goes down to the lodMin level (below), and then creates extra
 * even more filtered mips at the same lodMin resolution, associated with higher
 * roughness levels. In this way we maintain resolution to smoothly
 * interpolate diffuse lighting while limiting sampling computation.
 */
export class PMREMGenerator {
  private[$roughness]: Array < number >= [];
  private[$sigma]: Array < number >= [];
  private[$lodSize]: Array < number >= [];
  private[$lodPlanes]: Array < BufferGeometry >= [];
  private[$blurShader] = new BlurShader(MAX_SAMPLES);
  private[$flatCamera] = new OrthographicCamera(0, 3, 0, 2, 0, 1);

  constructor(private renderer: WebGLRenderer) {
    let lod = LOD_MAX;
    for (let i = 0; i < TOTAL_LODS; i++) {
      const sizeLod = Math.pow(2, lod);
      this[$lodSize].push(sizeLod);
      let sigma = 1.0 / sizeLod;
      let roughness =
          (1 + Math.sqrt(1 + 4 * Math.PI * sizeLod)) / (2 * Math.PI * sizeLod);
      if (i > LOD_MAX - LOD_MIN) {
        roughness = EXTRA_LOD_ROUGHNESS[i - LOD_MAX + LOD_MIN - 1];
        sigma = Math.PI * roughness * roughness / (1 + roughness);
      }
      this[$sigma].push(sigma);
      this[$roughness].push(roughness);

      const texelSize = 1.0 / (sizeLod - 1);
      const min = -texelSize / 2;
      const max = 1 + texelSize / 2;
      const uv = new Float32Array(
          [min, min, max, min, max, max, min, min, max, max, min, max]);

      const planes = new BufferGeometry();
      let offset = 0;
      for (let face = 0; face < 6; face++) {
        const plane = new BufferGeometry();

        const x = (face % 3);
        const y = i > 2 ? 1 : 0;
        const position = new Float32Array(
            [x, y, x + 1, y, x + 1, y + 1, x, y, x + 1, y + 1, x, y + 1]);
        plane.addAttribute('position', new BufferAttribute(position, 2));
        plane.addAttribute('uv', new BufferAttribute(uv, 2));

        const faceIndex = new Float32Array(6);
        faceIndex.fill(face);
        plane.addAttribute('faceIndex', new BufferAttribute(faceIndex, 1));

        planes.merge(plane, offset);
        offset += 6;
      }
      this[$lodPlanes].push(planes);

      if (lod > LOD_MIN) {
        lod--;
      }
    }
  }

  // generatePMREM():WebGLRenderTarget{}

  equirectangularToPMREM(equirectangular: Texture): WebGLRenderTarget {
    const cubeUVRenderTarget = this[$equirectangularToCubeUV](equirectangular);
    this[$applyPMREM](cubeUVRenderTarget);
    return cubeUVRenderTarget;
  }

  private[$equirectangularToCubeUV](equirectangular: Texture):
      WebGLRenderTarget {
    const params = {
      format: equirectangular.format,
      magFilter: NearestFilter,
      minFilter: NearestFilter,
      type: equirectangular.type,
      generateMipmaps: false,
      anisotropy: equirectangular.anisotropy,
      encoding: equirectangular.encoding
    };
    const cubeUVRenderTarget =
        new WebGLRenderTarget(3 * SIZE_MAX, 3 * SIZE_MAX, params);

    const scene = new Scene();
    scene.add(new Mesh(this[$lodPlanes][0], this[$blurShader]));
    const uniforms = this[$blurShader].uniforms;

    uniforms.copyEquirectangular.value = true;
    uniforms.envMap.value = equirectangular;

    this.renderer.setViewport(0, 0, 3 * SIZE_MAX, 2 * SIZE_MAX);

    this.renderer.setRenderTarget(cubeUVRenderTarget);
    this.renderer.render(scene, this[$flatCamera]);

    return cubeUVRenderTarget;
  }

  private[$applyPMREM](cubeUVRenderTarget: WebGLRenderTarget) {
    const pingPongRenderTarget = cubeUVRenderTarget.clone();

    for (let i = 1; i < TOTAL_LODS; i++) {
      const sigma = Math.sqrt(
          this[$sigma][i] * this[$sigma][i] -
          this[$sigma][i - 1] * this[$sigma][i - 1]);
      this[$gaussianBlur](
          cubeUVRenderTarget, pingPongRenderTarget, i - 1, i, sigma);
    }

    pingPongRenderTarget.dispose();
  }

  private[$gaussianBlur](
      cubeUVRenderTarget: WebGLRenderTarget,
      pingPongRenderTarget: WebGLRenderTarget, lodIn: number, lodOut: number,
      standardDeviationRadians: number) {
    const blurScene = new Scene();
    blurScene.add(new Mesh(this[$lodPlanes][lodOut], this[$blurShader]));
    const blurUniforms = this[$blurShader].uniforms;

    const inputSize = this[$lodSize][lodIn];
    const standardDeviations = 3;
    const n = Math.ceil(
        standardDeviations * standardDeviationRadians * inputSize * 2 /
        Math.PI);
    if (n > MAX_SAMPLES) {
      console.log(
          'StandardDeviationRadians, ',
          standardDeviationRadians,
          ', is too large and will clip, as it requested ',
          n,
          ' samples when the maximum is set to ',
          MAX_SAMPLES);
    }
    const inverseIntegral =
        standardDeviations / ((n - 1) * Math.sqrt(2 * Math.PI));
    let weights = [];
    for (let i = 0; i < MAX_SAMPLES; ++i) {
      const x = standardDeviations * i / (n - 1);
      weights.push(inverseIntegral * Math.exp(-x * x / 2));
    }

    blurUniforms.copyEquirectangular.value = false;
    blurUniforms.samples.value = n;
    blurUniforms.weights.value = weights;
    blurUniforms.dTheta.value =
        standardDeviationRadians * standardDeviations / (n - 1);
    blurUniforms.inputEncoding.value =
        encodings[cubeUVRenderTarget.texture.encoding];
    blurUniforms.outputEncoding.value =
        encodings[cubeUVRenderTarget.texture.encoding];

    blurUniforms.latitudinal.value = false;
    blurUniforms.envMap.value = cubeUVRenderTarget.texture;
    blurUniforms.mipInt.value = lodIn;

    const outputSize = this[$lodSize][lodOut];
    const x = 3 * Math.max(0, SIZE_MAX - 2 * outputSize);
    const y = (lodOut === 0 ? 0 : SIZE_MAX) +
        outputSize *
            (lodOut > LOD_MAX - LOD_MIN ? lodOut - LOD_MAX + LOD_MIN : 0);
    this.renderer.setViewport(x, y, 3 * outputSize, 2 * outputSize);

    this.renderer.setRenderTarget(pingPongRenderTarget);
    this.renderer.render(blurScene, this[$flatCamera]);

    blurUniforms.latitudinal.value = true;
    blurUniforms.envMap.value = pingPongRenderTarget.texture;
    blurUniforms.mipInt.value = lodOut;

    this.renderer.setRenderTarget(cubeUVRenderTarget);
    this.renderer.render(blurScene, this[$flatCamera]);
  }
};


class BlurShader extends RawShaderMaterial {
  constructor(maxSamples: number) {
    super({

      defines: {n: maxSamples},

      uniforms: {
        envMap: {value: null},
        copyEquirectangular: {value: false},
        samples: {value: 1},
        weights: {value: null},
        latitudinal: {value: false},
        dTheta: {value: 0},
        mipInt: {value: 0},
        inputEncoding: {value: encodings[LinearEncoding]},
        outputEncoding: {value: encodings[LinearEncoding]}
      },

      vertexShader: `
precision mediump float;
precision mediump int;
attribute vec2 position;
attribute vec2 uv;
attribute float faceIndex;
varying vec3 vOutputDirection;
${getDirectionChunk}
void main() {
    vOutputDirection = getDirection(uv, faceIndex);
    gl_Position = vec4( position, 0.0, 1.0 );
}
      `,

      fragmentShader: `
precision mediump float;
precision mediump int;
varying vec3 vOutputDirection;
uniform sampler2D envMap;
uniform bool copyEquirectangular;
uniform int samples;
uniform float weights[n];
uniform bool latitudinal;
uniform float dTheta;
uniform float mipInt;
#define RECIPROCAL_PI 0.31830988618
#define RECIPROCAL_PI2 0.15915494
${texelIO}
vec4 envMapTexelToLinear(vec4 color){return inputTexelToLinear(color);}
${bilinearCubeUVChunk}
void main() {
  if(copyEquirectangular){
    vec3 direction = normalize(vOutputDirection);
    vec2 sampleUV;
    sampleUV.y = asin( clamp( direction.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
    sampleUV.x = atan( direction.z, direction.x ) * RECIPROCAL_PI2 + 0.5;
    gl_FragColor = texture2D( envMap, sampleUV );
    return;
  }
  gl_FragColor = vec4(0.0);
  float xz = length(vOutputDirection.xz);
  for (int i = 0; i < n; i++) {
    if (i >= samples)
        break;
    for (int dir = -1; dir < 2; dir += 2) {
      if (i == 0 && dir == 1)
        continue;
      vec3 sampleDirection = vOutputDirection;
      if (latitudinal) {
        float diTheta = dTheta * float(dir * i) / xz;
        mat2 R = mat2(cos(diTheta), sin(diTheta), -sin(diTheta), cos(diTheta));
        sampleDirection.xz = R * sampleDirection.xz;
      } else {
        float diTheta = dTheta * float(dir * i);
        mat2 R = mat2(cos(diTheta), sin(diTheta), -sin(diTheta), cos(diTheta));
        vec2 xzY = R * vec2(xz, sampleDirection.y);
        sampleDirection.xz *= xzY.x / xz;
        sampleDirection.y = xzY.y;
      }
      gl_FragColor.rgb += weights[i] * bilinearCubeUV(envMap, sampleDirection, mipInt);
    }
  }
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}
      `,

      blending: NoBlending,
      depthTest: false,
      depthWrite: false
    });

    this.type = 'GaussianBlur';
  }
}
