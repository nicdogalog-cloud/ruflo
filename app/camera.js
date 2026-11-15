// Camera, zoom and recording.
// Uses the phone's real zoom when the browser allows it. If not, it records a
// centre crop through a canvas so the saved clip matches what you see.

export const ZOOM = { bat: 3, bowl: 1 };

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.track = null;
    this.hwZoom = null;   // {min,max} when the camera supports zoom
    this.cropZoom = 1;    // used when it doesn't
    this.rec = null;
    this.chunks = [];
    this.raf = 0;
  }

  get on() { return !!this.stream; }

  async start() {
    if (this.stream) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
    });
    this.stream = stream;
    this.track = stream.getVideoTracks()[0];
    const caps = this.track.getCapabilities ? this.track.getCapabilities() : {};
    this.hwZoom = caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max } : null;
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
  }

  stop() {
    if (!this.stream) return;
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = this.track = null;
    this.video.srcObject = null;
  }

  async setZoom(z) {
    if (this.hwZoom) {
      const v = Math.min(this.hwZoom.max, Math.max(this.hwZoom.min, z));
      try { await this.track.applyConstraints({ advanced: [{ zoom: v }] }); this.cropZoom = 1; this.video.style.transform = ''; return; }
      catch { /* fall through to crop */ }
    }
    this.cropZoom = z;
    this.video.style.transform = z > 1 ? `scale(${z})` : '';
  }

  pickType() {
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  recordStream() {
    if (this.cropZoom <= 1) return this.stream;
    const v = this.video, c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    const g = c.getContext('2d');
    const draw = () => {
      const vw = v.videoWidth, vh = v.videoHeight;
      if (vw) {
        const sw = vw / this.cropZoom, sh = vh / this.cropZoom;
        g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      }
      this.raf = requestAnimationFrame(draw);
    };
    draw();
    return c.captureStream(30);
  }

  startRecording() {
    const type = this.pickType();
    const src = this.recordStream();
    this.chunks = [];
    this.rec = new MediaRecorder(src, type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
    this.rec.ondataavailable = (e) => e.data && e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }

  stopRecording() {
    return new Promise((res) => {
      if (!this.rec) return res(null);
      const rec = this.rec;
      rec.onstop = () => {
        cancelAnimationFrame(this.raf);
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'video/mp4' });
        this.rec = null; this.chunks = [];
        res(blob);
      };
      rec.stop();
    });
  }

  snapshot() {
    const v = this.video, vw = v.videoWidth, vh = v.videoHeight;
    if (!vw) return '';
    const c = document.createElement('canvas');
    c.width = 480; c.height = 300;
    const z = this.cropZoom, sw = vw / z, sh = vh / z;
    const scale = Math.max(c.width / sw, c.height / sh);
    const dw = c.width / scale, dh = c.height / scale;
    c.getContext('2d').drawImage(v, (vw - dw) / 2, (vh - dh) / 2, dw, dh, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }
}

// Demo camera for the website preview: shows a nets photo instead of the
// live camera, and "records" by saving a ready-made demo clip.
export class DemoCamera {
  constructor(img) { this.img = img; this.on = false; this.z = 1; this.video = { play: () => Promise.resolve() }; }
  async start() { this.on = true; this.img.hidden = false; this.setZoom(this.z); }
  stop() { this.on = false; this.img.hidden = true; }
  async setZoom(z) { this.z = z; this.img.src = z > 1 ? 'demo/vf-bat.jpg' : 'demo/vf-bowl.jpg'; }
  startRecording() {}
  async stopRecording() { return null; }
  snapshot() { return this.z > 1 ? 'demo/hero-batter-nets-thumb.jpg' : 'demo/nets-empty-lane-thumb.jpg'; }
}
