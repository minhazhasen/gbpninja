// Google Business Profile photo and video rules for every upload in the browser (Profile audit photos, Media Library).
// Photo sizes live in profile.ts; the server checks video size again (src/lib/video-upload.ts).
import { PHOTO_MAX_BYTES, PHOTO_MIN_PX } from "@/lib/profile";

export { PHOTO_RECOMMENDED_PX } from "@/lib/profile";

export const PHOTO_ACCEPT = "image/jpeg,image/png";
export const PHOTO_MIN_BYTES = 10 * 1024;

export const VIDEO_ACCEPT = "video/mp4,video/quicktime";
export const VIDEO_MAX_BYTES = 75 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_MIN_PX = 720;

export const PHOTO_RULES = `JPG or PNG · 10 KB–5 MB · at least ${PHOTO_MIN_PX} × ${PHOTO_MIN_PX} px (720 × 720 or 1200 × 900 recommended)`;
export const VIDEO_RULES = `MP4 or MOV · up to ${VIDEO_MAX_SECONDS} seconds and 75 MB · 720p or sharper`;

/** Google's photo rules: JPG or PNG, 10 KB–5 MB, at least 250 × 250 px. Returns a problem, or null. */
export async function checkPhoto(file: File): Promise<string | null> {
  if (!PHOTO_ACCEPT.split(",").includes(file.type)) return `${file.name}: use a JPG or PNG`;
  if (file.size > PHOTO_MAX_BYTES) return `${file.name}: larger than 5 MB`;
  if (file.size < PHOTO_MIN_BYTES) return `${file.name}: smaller than 10 KB`;
  try {
    const bmp = await createImageBitmap(file);
    const { width, height } = bmp;
    bmp.close();
    if (width < PHOTO_MIN_PX || height < PHOTO_MIN_PX) return `${file.name}: ${width} × ${height} px; at least ${PHOTO_MIN_PX} × ${PHOTO_MIN_PX} px needed`;
  } catch {
    return `${file.name}: couldn't read this image`;
  }
  return null;
}

/** Google's video rules: MP4 or MOV, up to 75 MB, 30 seconds, 720p or sharper. Returns a problem, or null. */
export function checkVideo(file: File): Promise<string | null> {
  if (!/^video\/(mp4|quicktime)$/.test(file.type) && !/\.(mp4|mov)$/i.test(file.name)) return Promise.resolve(`${file.name}: use an MP4 or MOV video`);
  if (file.size > VIDEO_MAX_BYTES) return Promise.resolve(`${file.name}: larger than 75 MB`);
  return new Promise((done) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (msg: string | null) => {
      URL.revokeObjectURL(url);
      done(msg);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      if (v.duration > VIDEO_MAX_SECONDS + 0.5) return finish(`${file.name}: ${Math.round(v.duration)} seconds long; Google takes up to ${VIDEO_MAX_SECONDS}`);
      if (Math.min(v.videoWidth, v.videoHeight) < VIDEO_MIN_PX) return finish(`${file.name}: ${v.videoWidth} × ${v.videoHeight}; Google needs 720p or sharper`);
      finish(null);
    };
    // This browser can't read it (e.g. some MOV files): let Google decide.
    v.onerror = () => finish(null);
    v.src = url;
  });
}

/** Canvas → data URL in the file's format, falling back to JPEG when a PNG would pass 5 MB. */
export function canvasToUpload(canvas: HTMLCanvasElement, mime: string, quality = 0.86) {
  if (mime === "image/png") {
    const png = canvas.toDataURL("image/png");
    if ((png.length * 3) / 4 <= PHOTO_MAX_BYTES) return { url: png, mime: "image/png" };
  }
  return { url: canvas.toDataURL("image/jpeg", quality), mime: "image/jpeg" };
}
