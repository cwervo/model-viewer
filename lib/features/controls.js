/* @license
 * Copyright 2018 Google Inc. All Rights Reserved.
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { property } from 'lit-element';
import { Spherical, Vector3 } from 'three';
import { deserializeAngleToDeg, deserializeSpherical, deserializeVector3 } from '../conversions.js';
import { $ariaLabel, $loadedTime, $needsRender, $onModelLoad, $onResize, $scene, $tick } from '../model-viewer-base.js';
import { ChangeSource, SmoothControls } from '../three-components/SmoothControls.js';
const InteractionPromptStrategy = {
    AUTO: 'auto',
    WHEN_FOCUSED: 'when-focused',
    NONE: 'none'
};
const InteractionPolicy = {
    ALWAYS_ALLOW: 'always-allow',
    WHEN_FOCUSED: 'allow-when-focused'
};
export const DEFAULT_CAMERA_ORBIT = '0deg 75deg auto';
const DEFAULT_CAMERA_TARGET = 'auto auto auto';
const DEFAULT_FIELD_OF_VIEW = '45deg';
const HALF_PI = Math.PI / 2.0;
const THIRD_PI = Math.PI / 3.0;
const QUARTER_PI = HALF_PI / 2.0;
const PHI = 2.0 * Math.PI;
const AZIMUTHAL_QUADRANT_LABELS = ['front', 'right', 'back', 'left'];
const POLAR_TRIENT_LABELS = ['upper-', '', 'lower-'];
export const DEFAULT_INTERACTION_PROMPT_THRESHOLD = 3000;
export const INTERACTION_PROMPT = 'Use mouse, touch or arrow keys to control the camera!';
export const $controls = Symbol('controls');
export const $promptElement = Symbol('promptElement');
export const $idealCameraDistance = Symbol('idealCameraDistance');
const $deferInteractionPrompt = Symbol('deferInteractionPrompt');
const $updateAria = Symbol('updateAria');
const $updateCamera = Symbol('updateCamera');
const $updateCameraOrbit = Symbol('updateCameraOrbit');
const $updateCameraTarget = Symbol('updateCameraTarget');
const $updateFieldOfView = Symbol('updateFieldOfView');
const $blurHandler = Symbol('blurHandler');
const $focusHandler = Symbol('focusHandler');
const $changeHandler = Symbol('changeHandler');
const $promptTransitionendHandler = Symbol('promptTransitionendHandler');
const $onBlur = Symbol('onBlur');
const $onFocus = Symbol('onFocus');
const $onChange = Symbol('onChange');
const $onPromptTransitionend = Symbol('onPromptTransitionend');
const $shouldPromptUserToInteract = Symbol('shouldPromptUserToInteract');
const $waitingToPromptUser = Symbol('waitingToPromptUser');
const $userPromptedOnce = Symbol('userPromptedOnce');
const $lastSpherical = Symbol('lastSpherical');
const $jumpCamera = Symbol('jumpCamera');
export const ControlsMixin = (ModelViewerElement) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    class ControlsModelViewerElement extends ModelViewerElement {
        constructor() {
            super(...arguments);
            this.cameraControls = false;
            this.cameraOrbit = DEFAULT_CAMERA_ORBIT;
            this.cameraTarget = DEFAULT_CAMERA_TARGET;
            this.fieldOfView = DEFAULT_FIELD_OF_VIEW;
            this.interactionPromptThreshold = DEFAULT_INTERACTION_PROMPT_THRESHOLD;
            this.interactionPrompt = InteractionPromptStrategy.AUTO;
            this.interactionPolicy = InteractionPolicy.ALWAYS_ALLOW;
            this[_a] = this.shadowRoot.querySelector('.controls-prompt');
            this[_b] = false;
            this[_c] = false;
            this[_d] = true;
            this[_e] = new SmoothControls(this[$scene].getCamera(), this[$scene].canvas);
            this[_f] = null;
            this[_g] = new Spherical();
            this[_h] = false;
            this[_j] = (event) => this[$onChange](event);
            this[_k] = () => this[$onFocus]();
            this[_l] = () => this[$onBlur]();
            this[_m] = () => this[$onPromptTransitionend]();
        }
        getCameraOrbit() {
            const { theta, phi, radius } = this[$lastSpherical];
            return { theta, phi, radius };
        }
        getCameraTarget() {
            return this[$controls].getTarget();
        }
        getFieldOfView() {
            return this[$controls].getFieldOfView();
        }
        jumpCameraToGoal() {
            this[$jumpCamera] = true;
        }
        connectedCallback() {
            super.connectedCallback();
            this[$updateCameraOrbit]();
            this[$updateFieldOfView]();
            this[$promptTransitionendHandler]();
            this[$promptElement].addEventListener('transitionend', this[$promptTransitionendHandler]);
            this[$controls].addEventListener('change', this[$changeHandler]);
        }
        disconnectedCallback() {
            super.disconnectedCallback();
            this[$promptElement].removeEventListener('transitionend', this[$promptTransitionendHandler]);
            this[$controls].removeEventListener('change', this[$changeHandler]);
        }
        updated(changedProperties) {
            super.updated(changedProperties);
            const controls = this[$controls];
            const scene = this[$scene];
            if (changedProperties.has('cameraControls')) {
                if (this.cameraControls) {
                    controls.enableInteraction();
                    scene.canvas.addEventListener('focus', this[$focusHandler]);
                    scene.canvas.addEventListener('blur', this[$blurHandler]);
                }
                else {
                    scene.canvas.removeEventListener('focus', this[$focusHandler]);
                    scene.canvas.removeEventListener('blur', this[$blurHandler]);
                    controls.disableInteraction();
                }
            }
            if (changedProperties.has('interactionPrompt')) {
                if (this.interactionPrompt === InteractionPromptStrategy.AUTO) {
                    this[$waitingToPromptUser] = true;
                }
            }
            if (changedProperties.has('interactionPolicy')) {
                const interactionPolicy = this.interactionPolicy;
                controls.applyOptions({ interactionPolicy });
            }
            if (changedProperties.has('cameraOrbit')) {
                this[$updateCameraOrbit]();
            }
            if (changedProperties.has('cameraTarget')) {
                this[$updateCameraTarget]();
            }
            if (changedProperties.has('fieldOfView')) {
                this[$updateFieldOfView]();
            }
            if (this[$jumpCamera] === true) {
                this[$controls].jumpToGoal();
                this[$jumpCamera] = false;
            }
        }
        [(_a = $promptElement, _b = $userPromptedOnce, _c = $waitingToPromptUser, _d = $shouldPromptUserToInteract, _e = $controls, _f = $idealCameraDistance, _g = $lastSpherical, _h = $jumpCamera, _j = $changeHandler, _k = $focusHandler, _l = $blurHandler, _m = $promptTransitionendHandler, $updateFieldOfView)]() {
            let fov = deserializeAngleToDeg(this.fieldOfView);
            if (fov == null) {
                fov = deserializeAngleToDeg(DEFAULT_FIELD_OF_VIEW);
            }
            this[$controls].setFov(fov);
        }
        [$updateCameraOrbit]() {
            let sphericalValues = deserializeSpherical(this.cameraOrbit);
            if (sphericalValues == null) {
                sphericalValues = deserializeSpherical(DEFAULT_CAMERA_ORBIT);
            }
            let [theta, phi, radius] = sphericalValues;
            if (typeof radius === 'string') {
                switch (radius) {
                    default:
                    case 'auto':
                        radius = this[$idealCameraDistance];
                        break;
                }
            }
            this[$controls].setOrbit(theta, phi, radius);
        }
        [$updateCameraTarget]() {
            const targetValues = deserializeVector3(this.cameraTarget);
            let target = this[$scene].model.boundingBox.getCenter(new Vector3);
            if (targetValues != null) {
                for (let i = 0; i < 3; i++) {
                    if (targetValues[i] !== 'auto') {
                        target.setComponent(i, targetValues[i]);
                    }
                }
            }
            this[$controls].setTarget(target);
        }
        [$tick](time, delta) {
            super[$tick](time, delta);
            if (this[$waitingToPromptUser] &&
                this.interactionPrompt !== InteractionPromptStrategy.NONE) {
                if (this.loaded &&
                    time > this[$loadedTime] + this.interactionPromptThreshold) {
                    this[$scene].canvas.setAttribute('aria-label', INTERACTION_PROMPT);
                    // NOTE(cdata): After notifying users that the controls are
                    // available, we flag that the user has been prompted at least
                    // once, and then effectively stop the idle timer. If the camera
                    // orbit changes after this point, the user will never be prompted
                    // again for this particular <model-element> instance:
                    this[$userPromptedOnce] = true;
                    this[$waitingToPromptUser] = false;
                    this[$promptElement].classList.add('visible');
                }
            }
            this[$controls].update(time, delta);
        }
        [$deferInteractionPrompt]() {
            // Effectively cancel the timer waiting for user interaction:
            this[$waitingToPromptUser] = false;
            this[$promptElement].classList.remove('visible');
            // Implicitly there was some reason to defer the prompt. If the user
            // has been prompted at least once already, we no longer need to
            // prompt the user, although if they have never been prompted we
            // should probably prompt them at least once just in case.
            if (this[$userPromptedOnce]) {
                this[$shouldPromptUserToInteract] = false;
            }
        }
        /**
         * Changes the camera's radius to properly frame the scene based on
         * changes to framedHeight or fov, and maintains relative camera zoom
         * state.
         */
        [$updateCamera]() {
            const scene = this[$scene];
            const controls = this[$controls];
            const framedHeight = scene.framedHeight;
            const framedDistance = (framedHeight / 2) /
                Math.tan((controls.getFieldOfView() / 2) * Math.PI / 180);
            const near = framedHeight / 10.0;
            const far = framedHeight * 10.0;
            // When we update the idealCameraDistance due to reframing, we want to
            // maintain the user's zoom level (how they have changed the camera
            // radius), which we represent here as a ratio.
            const zoom = (this[$idealCameraDistance] != null) ?
                controls.getCameraSpherical().radius / this[$idealCameraDistance] :
                1;
            this[$idealCameraDistance] = framedDistance + scene.modelDepth / 2;
            controls.updateIntrinsics(near, far, scene.aspect);
            // Zooming out beyond the 'frame' doesn't serve much purpose
            // and will only end up showing the skysphere if zoomed out enough
            const minimumRadius = near + framedHeight / 2.0;
            const maximumRadius = this[$idealCameraDistance];
            controls.applyOptions({ minimumRadius, maximumRadius });
            controls.setRadius(zoom * this[$idealCameraDistance]);
            controls.jumpToGoal();
        }
        [$updateAria]() {
            // NOTE(cdata): It is possible that we might want to record the
            // last spherical when the label actually changed. Right now, the
            // side-effect the current implementation is that we will only
            // announce the first view change that occurs after the element
            // becomes focused.
            const { theta: lastTheta, phi: lastPhi } = this[$lastSpherical];
            const { theta, phi } = this[$controls].getCameraSpherical(this[$lastSpherical]);
            const rootNode = this.getRootNode();
            // Only change the aria-label if <model-viewer> is currently focused:
            if (rootNode != null && rootNode.activeElement === this) {
                const lastAzimuthalQuadrant = (4 + Math.floor(((lastTheta % PHI) + QUARTER_PI) / HALF_PI)) % 4;
                const azimuthalQuadrant = (4 + Math.floor(((theta % PHI) + QUARTER_PI) / HALF_PI)) % 4;
                const lastPolarTrient = Math.floor(lastPhi / THIRD_PI);
                const polarTrient = Math.floor(phi / THIRD_PI);
                if (azimuthalQuadrant !== lastAzimuthalQuadrant ||
                    polarTrient !== lastPolarTrient) {
                    const { canvas } = this[$scene];
                    const azimuthalQuadrantLabel = AZIMUTHAL_QUADRANT_LABELS[azimuthalQuadrant];
                    const polarTrientLabel = POLAR_TRIENT_LABELS[polarTrient];
                    const ariaLabel = `View from stage ${polarTrientLabel}${azimuthalQuadrantLabel}`;
                    canvas.setAttribute('aria-label', ariaLabel);
                }
            }
        }
        [$onPromptTransitionend]() {
            const svg = this[$promptElement].querySelector('svg');
            if (svg == null) {
                return;
            }
            // NOTE(cdata): We need to make sure that SVG animations are paused
            // when the prompt is not visible, otherwise we may a significant
            // compositing cost even while the prompt is at opacity 0.
            if (this[$promptElement].classList.contains('visible')) {
                svg.unpauseAnimations();
            }
            else {
                svg.pauseAnimations();
            }
        }
        [$onResize](event) {
            super[$onResize](event);
            this[$updateCamera]();
        }
        [$onModelLoad](event) {
            super[$onModelLoad](event);
            this[$updateCamera]();
            this[$updateCameraOrbit]();
            this[$updateCameraTarget]();
            this[$controls].jumpToGoal();
        }
        [$onFocus]() {
            const { canvas } = this[$scene];
            // NOTE(cdata): On every re-focus, we switch the aria-label back to
            // the original, non-prompt label if appropriate. If the user has
            // already interacted, they no longer need to hear the prompt.
            // Otherwise, they will hear it again after the idle prompt threshold
            // has been crossed.
            const ariaLabel = this[$ariaLabel];
            if (canvas.getAttribute('aria-label') !== ariaLabel) {
                canvas.setAttribute('aria-label', ariaLabel);
            }
            // NOTE(cdata): When focused, if the user has yet to interact with the
            // camera controls (that is, we "should" prompt the user), we begin
            // the idle timer and indicate that we are waiting for it to cross the
            // prompt threshold:
            if (this[$shouldPromptUserToInteract]) {
                this[$waitingToPromptUser] = true;
            }
        }
        [$onBlur]() {
            this[$waitingToPromptUser] = false;
            this[$promptElement].classList.remove('visible');
        }
        [$onChange]({ source }) {
            this[$updateAria]();
            this[$needsRender]();
            if (source === ChangeSource.USER_INTERACTION) {
                this[$deferInteractionPrompt]();
            }
            this.dispatchEvent(new CustomEvent('camera-change', { detail: { source } }));
        }
    }
    __decorate([
        property({ type: Boolean, attribute: 'camera-controls' })
    ], ControlsModelViewerElement.prototype, "cameraControls", void 0);
    __decorate([
        property({ type: String, attribute: 'camera-orbit', hasChanged: () => true })
    ], ControlsModelViewerElement.prototype, "cameraOrbit", void 0);
    __decorate([
        property({ type: String, attribute: 'camera-target', hasChanged: () => true })
    ], ControlsModelViewerElement.prototype, "cameraTarget", void 0);
    __decorate([
        property({ type: String, attribute: 'field-of-view', hasChanged: () => true })
    ], ControlsModelViewerElement.prototype, "fieldOfView", void 0);
    __decorate([
        property({ type: Number, attribute: 'interaction-prompt-threshold' })
    ], ControlsModelViewerElement.prototype, "interactionPromptThreshold", void 0);
    __decorate([
        property({ type: String, attribute: 'interaction-prompt' })
    ], ControlsModelViewerElement.prototype, "interactionPrompt", void 0);
    __decorate([
        property({ type: String, attribute: 'interaction-policy' })
    ], ControlsModelViewerElement.prototype, "interactionPolicy", void 0);
    return ControlsModelViewerElement;
};
//# sourceMappingURL=controls.js.map