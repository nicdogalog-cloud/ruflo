# Crease Cam: how the coaching tech works

**In short:** put one phone at the back of the net, press start, and play. The app spots each ball by itself, saves a 3-second clip of it, scores what you did, and at the end shows a Batting section and a Bowling section with every ball's clip, scores and tips.

## 1. Where the phone goes
Behind the batter's stumps, looking straight down the pitch, safely behind the net so the ball can't hit it. From there the batter is close, seen from behind, and the bowler is far away, seen from the front. One phone covers both.

## 2. The session
1. **Choose:** Batting, Bowling, or Both. Both is part of Pro (£3.99 a month).
2. **Record:** the phone films the whole session. Nothing is uploaded; it all runs on the phone.
3. **Each ball is found automatically:** the app sees movement at the far end (the bowler running in), then a burst of movement close up (the bat swing or leave). That pair counts as one ball. It waits 4 seconds before looking for the next one.
4. **3-second clip per ball:** 2 seconds before the swing and 1 second after.
5. **End of session:** a summary with a Batting tab and a Bowling tab. Each ball shows its clip, an overall score, what went well and what to work on.

## 3. What we score from the back of the net
| Who | Scores |
|---|---|
| **Batter (from behind, close)** | **Head still**: how far the head moves sideways before the shot (under 4 cm = 100, over 20 cm = 0). **Balance**: hips stay between the feet. **Upright body**: not leaning over. **Foot movement**: did the feet move to the ball. |
| **Bowler (from the front, far away)** | **Side lean at release** (falling away hurts accuracy). **High arm** at release. **Straight run-up**: not drifting sideways. **Landing line**: feet land in a straight line to the stumps. |

We dropped things this angle can't see well: stride length and front knee bend (need a side view), and exact elbow angles. Distances use a typical shoulder width of 40 cm, so they are good estimates, not exact.

## 4. What works today (prototype, in `session/`)
- `creasecam_session.py` takes one video and produces the per-ball clips, `session.json` and a `session.html` page that looks like the app's end screen.
- On a made-up test video (photos of a batter and a bowler moved around to fake 3 balls) it found all 3 balls at the right moments, cut 3-second clips, and scored both players. See `session/example-output/`.
- The far bowler was too small to find at first; looking at a zoomed-in top half of the picture fixed that on the test video.

## 5. Known limits (honest)
- **Not tested on real net footage yet.** The test video is fake, so ball spotting and scores are unproven in real light, with net mesh, other players in the next net, or a phone that wobbles.
- We don't track the ball itself yet. Spotting balls uses movement, so a batter fidgeting or someone walking past could fool it.
- A far-away bowler at night or in poor light may be too small or blurry to score.
- Cut-offs are first guesses that need a coach to check.
- The prototype runs on a laptop after the session; the phone app needs to do the same thing live.

## 6. Next step
Film 3-4 real net sessions from behind the stumps on a phone (10-20 balls each), run them through the prototype, and check: did it find every ball, and do the scores match what a coach sees?
