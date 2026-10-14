"""Crease Cam session pipeline (one phone at the back of the net).

Usage:
  python3 creasecam_session.py <video> --mode batting|bowling|both [--out DIR]

Camera: behind the batter's stumps, looking down the pitch. Batter = big person
near the bottom of the frame (seen from behind); bowler = small person far away
(seen from the front). Pipeline:
  1. pose on every frame (up to 2 people), label near/far by body height
  2. motion energy in the near zone (bottom half) and far zone (top half)
  3. a "ball" = a spike in near-zone motion (bat swing / leave) that follows
     far-zone motion (run-up + release) within 3 s; 4 s cooldown between balls
  4. cut a 3 s clip per ball (2 s before the spike, 1 s after) with ffmpeg
  5. score each ball for batting and/or bowling, write session.json + session.html
"""
import argparse, json, math, os, subprocess, html
import cv2, numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "..", "pose.task")
NOSE, L_SH, R_SH, L_WR, R_WR = 0, 11, 12, 15, 16
L_HIP, R_HIP, L_AN, R_AN = 23, 24, 27, 28
SHOULDER_CM = 40.0  # typical shoulder width, turns pixels into cm


def score(v, good, bad):
    t = (v - good) / (bad - good) if bad != good else 0
    return int(round(100 * (1 - min(max(t, 0), 1))))


def lean_deg(top, bottom):
    d = top - bottom
    return abs(math.degrees(math.atan2(d[0], -d[1] + 1e-9)))


# ---------- 1+2: pose and motion per frame ----------
def scan(path):
    opts = vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=MODEL),
                                        running_mode=vision.RunningMode.VIDEO, num_poses=2)
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames, prev, i = [], None, 0
    # second detector on a zoomed crop of the top half: the far bowler is too
    # small for the full-frame pass
    with vision.PoseLandmarker.create_from_options(opts) as lm, \
         vision.PoseLandmarker.create_from_options(opts) as lm_far:
        while True:
            ok, img = cap.read()
            if not ok: break
            h, w = img.shape[:2]
            g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (5, 5), 0)
            near = far = 0.0
            if prev is not None:
                d = cv2.absdiff(g, prev) > 25
                far, near = d[:h // 2].mean(), d[h // 2:].mean()
            prev = g
            res = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,
                                               data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)),
                                      int(i * 1000 / fps))
            people = [np.array([[p.x * w, p.y * h] for p in L]) for L in res.pose_landmarks]
            people.sort(key=lambda P: P[:, 1].max() - P[:, 1].min(), reverse=True)
            batter = people[0] if people and people[0][:, 1].max() > h * 0.5 else None
            crop = cv2.resize(img[:h // 2], None, fx=2, fy=2)
            rf = lm_far.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,
                                                  data=cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)),
                                         int(i * 1000 / fps))
            far_people = [np.array([[p.x * w, p.y * h / 2] for p in L]) for L in rf.pose_landmarks]
            bowler = far_people[0] if far_people else None
            frames.append(dict(near=near, far=far, batter=batter, bowler=bowler))
            i += 1
    cap.release()
    return frames, fps


# ---------- 3: delivery events ----------
def find_balls(frames, fps):
    near = np.convolve([f["near"] for f in frames], np.ones(5) / 5, "same")
    far = np.convolve([f["far"] for f in frames], np.ones(5) / 5, "same")
    thr_n = max(np.median(near) * 4, 0.004)
    thr_f = max(np.median(far) * 4, 0.002)
    balls, last = [], -10 ** 9
    for t in range(1, len(near) - 1):
        if near[t] >= thr_n and near[t] == near[max(0, t - int(fps)):t + int(fps)].max():
            if t - last < 4 * fps: continue
            lo = max(0, t - int(3 * fps))
            if far[lo:t].max() < thr_f: continue  # no run-up seen first
            balls.append(t); last = t
    return balls


# ---------- 5: scoring ----------
def scale(P):
    return SHOULDER_CM / (np.linalg.norm(P[L_SH] - P[R_SH]) + 1e-9)


def score_batting(win):
    pts = [f["batter"] for f in win if f["batter"] is not None]
    if len(pts) < 5: return None
    key = pts[-1]  # frame at the swing spike
    out = []
    pre = pts[-min(len(pts), 30):]
    k = scale(key)
    head = (max(P[NOSE][0] for P in pre) - min(P[NOSE][0] for P in pre)) * k
    out.append(("Head still", score(head, 4, 20), f"head moved {head:.0f} cm sideways",
                "Head stayed still into the shot." if head < 8 else
                f"Your head moved about {head:.0f} cm across - keep it still as the ball arrives."))
    hip = (key[L_HIP] + key[R_HIP]) / 2
    a, b = sorted([key[L_AN][0], key[R_AN][0]])
    off = 0 if a <= hip[0] <= b else min(abs(hip[0] - a), abs(hip[0] - b)) * k
    out.append(("Balance", score(off, 0, 20), f"hips {off:.0f} cm outside feet",
                "Weight stayed between your feet." if off < 5 else
                "You fell over to one side - keep your hips between your feet."))
    lean = lean_deg((key[L_SH] + key[R_SH]) / 2, hip)
    out.append(("Upright body", score(lean, 10, 35), f"body lean {lean:.0f} deg",
                "Good upright shape." if lean < 15 else
                "You're leaning a lot - stay tall and move your feet to the ball."))
    move = abs(pre[-1][L_AN][0] - pre[0][L_AN][0]) * k + abs(pre[-1][R_AN][0] - pre[0][R_AN][0]) * k
    moved = move > 10
    out.append(("Foot movement", 100 if moved else 40, f"feet moved {move:.0f} cm",
                "You moved your feet to the ball." if moved else
                "Your feet barely moved - get a step in towards the ball."))
    return out


def score_bowling(win):
    pts = [f["bowler"] for f in win if f["bowler"] is not None]
    if len(pts) < 5: return None
    # release ~ frame where a wrist is highest above the head
    rel = min(pts, key=lambda P: min(P[L_WR][1], P[R_WR][1]) - P[NOSE][1])
    k = scale(rel)
    out = []
    lean = lean_deg((rel[L_SH] + rel[R_SH]) / 2, (rel[L_HIP] + rel[R_HIP]) / 2)
    out.append(("Side lean at release", score(lean, 8, 30), f"{lean:.0f} deg lean",
                "Nice tall release." if lean < 12 else
                "You fall away at release - keep your head over your front foot."))
    high = rel[NOSE][1] - min(rel[L_WR][1], rel[R_WR][1])
    arm_ok = high > 0
    out.append(("High arm", 100 if arm_ok else 30, "hand above head" if arm_ok else "hand below head",
                "Bowling arm came over high." if arm_ok else "Get your bowling arm up higher at release."))
    xs = [((P[L_HIP] + P[R_HIP]) / 2)[0] for P in pts]
    drift = (max(xs) - min(xs)) * k
    out.append(("Straight run-up", score(drift, 30, 150), f"drifted {drift:.0f} cm sideways",
                "Run-up was straight at the stumps." if drift < 50 else
                "Your run-up drifts sideways - run straight at the target."))
    feet = abs(rel[L_AN][0] - rel[R_AN][0]) * k
    out.append(("Landing line", score(feet, 15, 50), f"feet {feet:.0f} cm apart sideways",
                "Feet landed in line with the stumps." if feet < 25 else
                "Your feet land across each other - land in a straight line to the stumps."))
    return out


def pack(items):
    if items is None:
        return dict(overall=None, scores=[], good=[], work_on=["Player not seen clearly enough to score this ball."])
    s = [dict(name=n, score=v, measured=m, tip=t) for n, v, m, t in items]
    return dict(overall=int(round(np.mean([x["score"] for x in s]))), scores=s,
                good=[x["tip"] for x in s if x["score"] >= 70],
                work_on=[x["tip"] for x in s if x["score"] < 70])


def cut(src, start, dst):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-i", src,
                    "-t", "3", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst],
                   check=True)


def render(rep, path):
    def tab(kind):
        rows = []
        for b in rep["balls"]:
            r = b.get(kind)
            if r is None: continue
            sc = "".join(f"<tr><td>{html.escape(s['name'])}</td><td>{s['score']}</td><td>{html.escape(s['measured'])}</td></tr>" for s in r["scores"])
            good = "".join(f"<li>{html.escape(t)}</li>" for t in r["good"])
            bad = "".join(f"<li>{html.escape(t)}</li>" for t in r["work_on"])
            ov = "-" if r["overall"] is None else r["overall"]
            rows.append(f"""<div class=ball><div class=head><b>Ball {b['n']}</b><span class=ov>{ov}</span></div>
<video src="{b['clip']}" controls muted playsinline loop></video>
<table>{sc}</table><div class=g><b>Good</b><ul>{good or '<li>-</li>'}</ul></div>
<div class=w><b>Work on</b><ul>{bad or '<li>-</li>'}</ul></div></div>""")
        avg = rep["summary"].get(kind)
        return f"<section id={kind}><p class=avg>Session average: <b>{avg if avg is not None else '-'}</b> over {len(rows)} balls</p>{''.join(rows)}</section>"
    tabs = [k for k in ("batting", "bowling") if k in rep["modes"]]
    btns = "".join(f"<button onclick=\"show('{k}')\" id=b-{k}>{k.title()}</button>" for k in tabs)
    page = f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Session Summary</title><style>
:root{{--bg:#0f1a14;--card:#18271e;--fg:#eef3ef;--mut:#9bb0a3;--acc:#3ccf7a;--bad:#f0a04b}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif}}main{{max-width:480px;margin:auto;padding:16px}}
h1{{font-size:20px}}.tabs{{display:flex;gap:8px}}button{{flex:1;padding:10px;border:0;border-radius:10px;background:var(--card);color:var(--fg);font-weight:600}}
button.on{{background:var(--acc);color:#05200f}}.ball{{background:var(--card);border-radius:14px;padding:12px;margin:12px 0}}
.head{{display:flex;justify-content:space-between}}.ov{{font-size:22px;color:var(--acc);font-weight:700}}video{{width:100%;border-radius:10px;margin:8px 0;background:#000}}
table{{width:100%;font-size:13px;color:var(--mut)}}td:nth-child(2){{color:var(--fg);font-weight:700}}.g b{{color:var(--acc)}}.w b{{color:var(--bad)}}ul{{margin:4px 0;padding-left:18px}}.avg{{color:var(--mut)}}
</style></head><body><main><h1>Session over - {len(rep['balls'])} balls</h1><div class=tabs>{btns}</div>{''.join(tab(k) for k in tabs)}</main>
<script>function show(k){{document.querySelectorAll('section').forEach(s=>s.hidden=s.id!=k);document.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.id=='b-'+k))}}show('{tabs[0]}')</script></body></html>"""
    open(path, "w").write(page)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--mode", choices=["batting", "bowling", "both"], default="both")
    ap.add_argument("--out", default="out")
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, "clips"), exist_ok=True)
    modes = ["batting", "bowling"] if a.mode == "both" else [a.mode]
    frames, fps = scan(a.video)
    balls = find_balls(frames, fps)
    rep = dict(video=os.path.basename(a.video), modes=modes, fps=fps, balls=[], summary={})
    for n, t in enumerate(balls, 1):
        start = max(0, t / fps - 2)
        clip = f"clips/ball{n:02d}.mp4"
        cut(a.video, start, os.path.join(a.out, clip))
        win = frames[int(start * fps):t + 1]
        b = dict(n=n, time_s=round(t / fps, 2), clip=clip)
        if "batting" in modes: b["batting"] = pack(score_batting(win))
        if "bowling" in modes: b["bowling"] = pack(score_bowling(win))
        rep["balls"].append(b)
    for m in modes:
        v = [b[m]["overall"] for b in rep["balls"] if b[m]["overall"] is not None]
        rep["summary"][m] = int(round(np.mean(v))) if v else None
    json.dump(rep, open(os.path.join(a.out, "session.json"), "w"), indent=2)
    render(rep, os.path.join(a.out, "session.html"))
    print(f"{len(balls)} balls at", [round(t / fps, 1) for t in balls], "->", a.out)


if __name__ == "__main__":
    main()
