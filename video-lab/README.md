# Roundnet Video Lab (Milestone 1, Tracking v2)

This folder contains a **from-scratch**, isolated pipeline for roundnet video tracking and distance measurement.
It does **not** reuse the old browser MediaPipe annotate flow.

## What this milestone does

1. Processes one session video offline.
2. Produces 4 persistent player identities (`p1..p4`) across the clip using:
   - detector + MOT (BoT-SORT),
   - motion gating,
   - appearance embeddings (head/torso color histograms).
3. Computes ground-plane distance in feet from **ankle/foot points** (not hips), using net diameter = 3 ft for scale.
4. Writes JSON for a new web review page at `/video-lab/review`.

## What this milestone does NOT do

- Ball tracking
- Rally/event auto-labeling
- Highlight generation
- iOS integration

## Local setup (Python)

```bash
python3 -m venv .venv-video-lab
source .venv-video-lab/bin/activate
pip install -r video-lab/requirements.txt
```

## Step 1: mark net points once (clockwise on rim)

```bash
python video-lab/mark_net_points.py \
  --video ~/Desktop/IMG_3742.MOV \
  --output video-lab/output/net_points.json
```

- Click 4 points clockwise around the yellow net rim.
- Press `s` to save.
- Press `r` to reset.

## Step 2: process the video offline

```bash
python video-lab/track_roundnet_session.py \
  --video ~/Desktop/IMG_3742.MOV \
  --output video-lab/output/img_3742.tracking.json \
  --net-points-file video-lab/output/net_points.json \
  --player-names left,far,near,right \
  --write-first-frame video-lab/output/img_3742.first-frame.jpg
```

### Notes

- `--player-names` assumes the first stable frame is ordered left-to-right.
- If no net points are supplied, tracking still works but `distanceFeetByPlayer` is `null`.
- Do not commit large videos; only commit scripts/docs/small JSON fixtures when needed.

## Step 3: review in web UI

1. Run the Next.js app:
   ```bash
   npm run dev
   ```
2. Open: `http://localhost:3000/video-lab/review`
3. Load:
   - the generated JSON (`img_3742.tracking.json`)
   - the local video file (`IMG_3742.MOV`)
4. Verify:
   - 4 colored trajectories and current dots
   - names and distances in feet
   - jump warnings for suspicious ID teleports
5. Optional correction:
   - pause at problem frame
   - swap two identities from that frame onward
   - export corrected JSON

## Output schema

Top-level fields in output JSON:

- `schemaVersion`: `"roundnet-tracking-v2"`
- `video`: width/height/fps/frameCount/duration
- `calibration`: net points + homography (or `null`)
- `players`: four persistent identities
- `frames`: sparse per-frame observations per player
- `distanceFeetByPlayer`: computed path length on ground plane
- `diagnostics`: bootstrap frame, missing-frame counts, jump warnings

## Architecture notes

- The tracker keeps exactly four persistent identity slots after bootstrap.
- During occlusions or uncertain matches, it leaves gaps instead of stealing another player ID.
- Distance accumulation uses smoothing + minimum movement threshold + max speed gate to suppress jitter/shadow noise.
