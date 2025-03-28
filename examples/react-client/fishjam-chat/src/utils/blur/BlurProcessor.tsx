import type { ImageSegmenterCallback } from "@mediapipe/tasks-vision";
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

import BlurWorker from "./BlurProcessorWorker?worker";

export class BlurProcessor {
  private width: number;
  private height: number;

  // stores frames of the video
  private canvas: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D;

  // downsamples camera feed, used to blur background
  private resizedCanvas: HTMLCanvasElement;
  private resizedCanvasCtx: CanvasRenderingContext2D;

  private webglCanvas: HTMLCanvasElement;
  private webglCanvasCtx: WebGL2RenderingContext;

  private segmenter: ImageSegmenter | null = null;
  private prevVideoTime: number = 0;
  stream: MediaStream;
  track: MediaStreamTrack;
  private video: HTMLVideoElement;
  private worker = new BlurWorker();
  private worksInForeground = true;
  private fps: number;
  private destroyed = false;

  constructor(video: MediaStream) {
    const trackSettings = video.getVideoTracks()[0].getSettings();
    this.width = trackSettings.width ?? 1280;
    this.height = trackSettings.height ?? 720;

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("width", "" + this.width / 2);
    this.canvas.setAttribute("height", "" + this.height / 2);
    this.canvasCtx = this.canvas.getContext("2d")!;

    this.resizedCanvas = document.createElement("canvas");
    this.resizedCanvas.setAttribute("width", "" + this.width / 4);
    this.resizedCanvas.setAttribute("height", "" + this.height / 4);
    this.resizedCanvasCtx = this.resizedCanvas.getContext("2d")!;

    this.webglCanvas = document.createElement("canvas");
    this.webglCanvas.setAttribute("width", "" + this.width);
    this.webglCanvas.setAttribute("height", "" + this.height);
    this.webglCanvasCtx = this.webglCanvas.getContext("webgl2")!;

    this.fps = trackSettings.frameRate ?? 24;
    this.stream = this.webglCanvas.captureStream(this.fps);
    this.track = this.stream.getVideoTracks()[0];

    this.video = document.createElement("video");
    this.video.srcObject = video;
    this.video.muted = true;
    this.video.play();

    this.initMediaPipe();
    this.initWebgl();

    document.addEventListener("visibilitychange", this.visibilityListener);
    this.worker.onmessage = this.onFrameCallback;
    this.video.requestVideoFrameCallback(this.onFrameCallback);
  }

  private visibilityListener = () => {
    if (document.visibilityState === "visible") {
      this.worksInForeground = true;
      this.worker.postMessage({ type: "stop" });
    } else {
      this.worksInForeground = false;
      this.worker.postMessage({ type: "start", fps: this.fps });
    }
  };

  private async initMediaPipe() {
    const wasm = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.11/wasm",
    );
    this.segmenter = await ImageSegmenter.createFromOptions(wasm, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite",
      },
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    });
  }

  private async initWebgl() {
    const gl = this.webglCanvasCtx;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const program = gl.createProgram()!;
    const vs = await this.loadShader(
      gl,
      gl.VERTEX_SHADER,
      "/shaders/blur/vertex.glsl",
    );
    const fs = await this.loadShader(
      gl,
      gl.FRAGMENT_SHADER,
      "/shaders/blur/fragment.glsl",
    );
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -3, -1, 1, 3, 1]),
      gl.STREAM_DRAW,
    );
    const a_Position = gl.getAttribLocation(program, "a_Position");
    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);

    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const textureLoc = gl.getUniformLocation(program, "texture");
    gl.uniform1i(textureLoc, 0);

    const confidenceTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, confidenceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const confidenceTextureLoc = gl.getUniformLocation(
      program,
      "confidenceTexture",
    );
    gl.uniform1i(confidenceTextureLoc, 1);

    const resizedTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, resizedTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const resizedTextureLoc = gl.getUniformLocation(program, "resizedTexture");
    gl.uniform1i(resizedTextureLoc, 2);
  }

  private async loadShader(
    gl: WebGL2RenderingContext,
    type: number,
    path: string,
  ): Promise<WebGLShader> {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, await (await fetch(path)).text());
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Failed to compile shader", {
        path: path,
        error: gl.getShaderInfoLog(shader),
      });

      throw "Failed to compile shader";
    }

    return shader;
  }

  destroy() {
    document.removeEventListener("visibilitychange", this.visibilityListener);
    this.worker.terminate();
    this.track.stop();
    this.segmenter?.close();
    this.destroyed = true;

    this.canvas.remove();
    this.resizedCanvas.remove();
    this.webglCanvas.remove();
    this.video.remove();
  }

  private onFrameCallback = () => {
    if (this.destroyed) return;

    if (!this.segmenter || this.prevVideoTime >= this.video.currentTime) {
      if (this.worksInForeground) {
        this.video.requestVideoFrameCallback(this.onFrameCallback);
      }
      return;
    }

    this.canvasCtx.drawImage(this.video, 0, 0, this.width / 2, this.height / 2);

    this.resizedCanvasCtx.drawImage(
      this.canvas,
      0,
      0,
      this.width / 4,
      this.height / 4,
    );

    this.prevVideoTime = this.video.currentTime;
    this.segmenter.segmentForVideo(
      this.canvas,
      this.video.currentTime * 1000,
      this.onSegmentationReady,
    );

    if (this.worksInForeground) {
      this.video.requestVideoFrameCallback(this.onFrameCallback);
    }
  };

  private onSegmentationReady: ImageSegmenterCallback = (result) => {
    const confidenceMask = result.confidenceMasks![0];

    const gl = this.webglCanvasCtx;
    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.video,
    );

    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      confidenceMask.width,
      confidenceMask.height,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      confidenceMask.getAsUint8Array(),
    );

    gl.activeTexture(gl.TEXTURE2);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.resizedCanvas,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}
