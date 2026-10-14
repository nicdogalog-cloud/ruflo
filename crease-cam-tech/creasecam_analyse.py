"""Crease Cam prototype: pose estimation + technique scores + feedback.

Usage:
  python3 creasecam_analyse.py <image-or-video> [--angle batting-front|batting-side|bowling-front|bowling-side] [--out DIR]

Needs: pip install mediapipe opencv-python numpy, and pose.task (MediaPipe Pose
Landmarker model) next to this file. Everything runs locally; nothing is uploaded.
The on-phone app would use the same model via MediaPipe for Android/iOS.
"""
import argparse, json, math, os, sys
import cv2, numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "pose.task")
TORSO_CM = 50.0  # average shoulder-to-hip length, used to turn pixels into cm

# MediaPipe landmark indices we use
NOSE, L_EYE, R_EYE = 0, 2, 5
L_SH, R_SH, L_EL, R_EL, L_WR, R_WR = 11, 12, 13, 14, 15, 16
L_HIP, R_HIP, L_KN, R_KN, L_AN, R_AN = 23, 24, 25, 26, 27, 28
BONES = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),
         (23,25),(25,27),(24,26),(26,28),(27,31),(28,32),(0,11),(0,12)]


def score(value, good, bad):
    """Linear 0-100: value<=good -> 100, value>=bad -> 0 (works either direction)."""
    if good == bad: return 100
    t = (value - good) / (bad - good)
    return int(round(100 * (1 - min(max(t, 0), 1))))


def angle(a, b, c):
    ba, bc = a - b, c - b
    cos = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-9)
    return math.degrees(math.acos(np.clip(cos, -1, 1)))


def tilt(a, b):
    """Angle of line a->b from horizontal, degrees (0 = level)."""
    d = b - a
    return abs(math.degrees(math.atan2(d[1], abs(d[0]) + 1e-9)))


def detect(path):
    """Return list of (frame_bgr, pts Nx2 pixel array) for frames with a person."""
    is_video = path.lower().endswith((".mp4", ".mov", ".m4v", ".avi"))
    mode = vision.RunningMode.VIDEO if is_video else vision.RunningMode.IMAGE
    opts = vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=MODEL),
                                        running_mode=mode, num_poses=1)
    out = []
    with vision.PoseLandmarker.create_from_options(opts) as lm:
        if not is_video:
            img = cv2.imread(path)
            res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB,
                                     data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
            if res.pose_landmarks:
                out.append((img, to_px(res.pose_landmarks[0], img)))
            return out, False
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        i = 0
        while True:
            ok, img = cap.read()
            if not ok: break
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,
                                               data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)),
                                      int(i * 1000 / fps))
            if res.pose_landmarks:
                out.append((img, to_px(res.pose_landmarks[0], img)))
            i += 1
        cap.release()
    return out, True


def to_px(lms, img):
    h, w = img.shape[:2]
    return np.array([[p.x * w, p.y * h] for p in lms])


def cm_per_px(p):
    torso = np.linalg.norm((p[L_SH] + p[R_SH]) / 2 - (p[L_HIP] + p[R_HIP]) / 2)
    return TORSO_CM / max(torso, 1)


def analyse(frames, is_video, view):
    """Return list of {name, score, value, feedback}."""
    # Use the frame with the widest stride as the "key moment" (front foot landing).
    key = max(frames, key=lambda f: abs(f[1][L_AN][0] - f[1][R_AN][0]))
    p = key[1]; k = cm_per_px(p)
    mid_feet = (p[L_AN] + p[R_AN]) / 2
    mid_hip = (p[L_HIP] + p[R_HIP]) / 2
    mid_sh = (p[L_SH] + p[R_SH]) / 2
    res = []

    def add(name, s, value, good, bad):
        res.append({"name": name, "score": s, "value": value,
                    "feedback": good if s >= 70 else bad})

    # Head stillness: on video = sideways drift of the nose across the clip;
    # on a single photo = how far the head sits outside the base of the feet.
    if is_video and len(frames) > 5:
        xs = np.array([f[1][NOSE][0] for f in frames]) * k
        drift = float(np.percentile(xs, 95) - np.percentile(xs, 5))
        add("Head movement", score(drift, 4, 20), f"{drift:.0f} cm drift",
            f"Head stayed steady ({drift:.0f} cm of movement). Nice.",
            f"Your head moved about {drift:.0f} cm sideways during the shot - try to keep it still as the ball arrives.")
    elif view.startswith("batting"):  # bowlers lean naturally at release, so skip for them
        off = abs(p[NOSE][0] - mid_feet[0]) * k
        add("Head position", score(off, 8, 35), f"{off:.0f} cm from centre",
            "Head is nicely over your base.",
            f"Your head is {off:.0f} cm outside your feet - you're falling over; get your head over the front foot.")
    eye_tilt = tilt(p[L_EYE], p[R_EYE])
    if view.endswith("front"): add("Eyes level", score(eye_tilt, 8, 30), f"{eye_tilt:.0f} deg",
        "Eyes are level - good for judging the ball.",
        f"Your head is tilted {eye_tilt:.0f} degrees - keep your eyes level to judge line and length.")

    if view.startswith("batting"):
        stride = abs(p[L_AN][0] - p[R_AN][0]) * k
        if view == "batting-side":
            add("Foot movement (stride)", score(-stride, -60, -15), f"{stride:.0f} cm",
                f"Good positive stride of {stride:.0f} cm toward the ball.",
                f"Your stride is only {stride:.0f} cm - step further toward the pitch of the ball.")
            # front knee = the knee nearest the front ankle (lower x-distance to nose)
            fk = min((L_KN, R_KN), key=lambda i: abs(p[i][0] - p[NOSE][0]))
            off = abs(p[NOSE][0] - p[fk][0]) * k
            add("Head over front knee", score(off, 8, 30), f"{off:.0f} cm",
                "Head is over the front knee - great for control.",
                f"Your head is {off:.0f} cm behind/ahead of your front knee - lean into the shot so it sits over the knee.")
        else:
            w = abs(p[L_SH][0] - p[R_SH][0]) * k
            ratio = stride / max(w, 1)
            add("Foot movement (base)", score(abs(ratio - 1.3), 0.3, 1.2), f"{ratio:.1f}x shoulder width",
                "Stable base - feet about shoulder width or a bit more.",
                "Your feet are too " + ("narrow" if ratio < 1.3 else "wide") + " - aim for a little wider than shoulder width.")
        add("Body balance", score(abs(mid_hip[0] - mid_feet[0]) * k, 6, 30),
            f"{abs(mid_hip[0]-mid_feet[0])*k:.0f} cm hips off-centre",
            "Hips are balanced between your feet.",
            "Your hips are drifting outside your base - stay balanced so you can hold your finish.")
    else:  # bowling
        sh_tilt, hip_tilt = tilt(p[L_SH], p[R_SH]), tilt(p[L_HIP], p[R_HIP])
        trunk = tilt(mid_hip, mid_sh); side_lean = 90 - trunk
        if view == "bowling-front":
            add("Body alignment (side lean)", score(side_lean, 15, 40), f"{side_lean:.0f} deg",
                "Upright through the crease - good for accuracy.",
                f"You're falling away {side_lean:.0f} degrees at release - stay taller, head over the front foot.")
            gap = abs(p[L_AN][0] - p[R_AN][0]) * k
            add("Foot movement (landing line)", score(gap, 15, 45), f"{gap:.0f} cm apart sideways",
                "Feet land in a straight line toward the target.",
                f"Your feet land {gap:.0f} cm apart sideways - land back foot and front foot in a line toward the stumps.")
        else:
            fk = min((L_KN, R_KN), key=lambda i: p[i][0] if p[NOSE][0] < mid_hip[0] else -p[i][0])
            fa = L_AN if fk == L_KN else R_AN; fh = L_HIP if fk == L_KN else R_HIP
            ka = angle(p[fh], p[fk], p[fa])
            add("Front leg brace", score(-ka, -170, -130), f"{ka:.0f} deg knee angle",
                "Strong braced front leg - that's where your pace comes from.",
                f"Your front knee collapses to {ka:.0f} degrees - brace it straighter at landing for more pace.")
            arm = max(((L_SH, L_EL, L_WR), (R_SH, R_EL, R_WR)), key=lambda t: -p[t[2]][1])
            ea = angle(p[arm[0]], p[arm[1]], p[arm[2]])
            add("Bowling arm", score(-ea, -165, -140), f"{ea:.0f} deg elbow",
                "Bowling arm looks straight at the top.",
                f"Your bowling elbow reads {ea:.0f} degrees - check your action stays straight (camera angle can distort this).")
        add("Shoulder/hip tilt", score(abs(sh_tilt - hip_tilt), 10, 35), f"{abs(sh_tilt-hip_tilt):.0f} deg",
            "Shoulders and hips work together.",
            "Shoulders and hips are out of sync - think about a smoother hip-shoulder rotation.")
    return res, key


def draw(img, p, results, title):
    img = img.copy(); h, w = img.shape[:2]; t = max(2, w // 400)
    for a, b in BONES:
        cv2.line(img, tuple(p[a].astype(int)), tuple(p[b].astype(int)), (0, 255, 120), t)
    for i in [0] + list(range(11, 17)) + list(range(23, 29)):
        cv2.circle(img, tuple(p[i].astype(int)), t * 2, (0, 140, 255), -1)
    fs = w / 1400; y = int(40 * fs) + 10
    lines = [title] + [f"{r['name']}: {r['score']}/100" for r in results]
    box_h = y + int(36 * fs) * len(lines)
    ov = img.copy(); cv2.rectangle(ov, (0, 0), (int(w * 0.5), box_h), (0, 0, 0), -1)
    img = cv2.addWeighted(ov, 0.55, img, 0.45, 0)
    for s in lines:
        cv2.putText(img, s, (12, y), cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255), max(1, t // 2 + 1))
        y += int(36 * fs)
    return img


def guess_view(path):
    n = os.path.basename(path).lower()
    for v in ("batting-front", "batting-side", "bowling-front", "bowling-side"):
        if v in n: return v
    return "bowling-side" if "bowl" in n else "batting-front"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+"); ap.add_argument("--angle"); ap.add_argument("--out", default=os.path.join(HERE, "examples"))
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); report = {}
    for f in a.files:
        view = a.angle or guess_view(f)
        frames, is_video = detect(f)
        name = os.path.splitext(os.path.basename(f))[0]
        if not frames:
            print(f"\n{name}: no player found"); report[name] = None; continue
        results, key = analyse(frames, is_video, view)
        overall = int(np.mean([r["score"] for r in results]))
        print(f"\n== {name} ({view}, {'video' if is_video else 'photo'}) overall {overall}/100")
        for r in results:
            print(f"  {r['score']:3d}  {r['name']:<28} {r['value']:<22} {r['feedback']}")
        cv2.imwrite(os.path.join(a.out, f"{name}_annotated.jpg"), draw(key[0], key[1], results, f"{view}  overall {overall}/100"))
        report[name] = {"view": view, "overall": overall, "scores": results}
    with open(os.path.join(a.out, "report.json"), "w") as fh: json.dump(report, fh, indent=2)


if __name__ == "__main__":
    main()
