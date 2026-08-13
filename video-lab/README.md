# Roundnet Video Lab (Milestone 1, Tracking v2)

This folder contains a **from-scratch**, isolated pipeline for roundnet video tracking and distance measurement.
It does **not** reuse the old browser MediaPipe annotate flow.

## What this milestone does

1. Processes one session video offline.
2. Produces 4 persistent player identities (`p1..p4`) across the clip using:
   - detector + MOT (BoT-SORT),
   - fixed 4-slot identity layer (never mints slot 5),
   - user tap-to-name slot seeding,
   - head/hat-first appearance matching (caps/boonie prioritized over white shirts),
   - occlusion memory with no ID theft.
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

## Step 1 (required): tap-to-name identity slots

1. Run the Next.js app:
   ```bash
   npm run dev
   ```
2. Open: `http://localhost:3000/video-lab/setup`
3. Pause on frame 0 (or a clear early frame), then:
   - select `p1..p4`
   - tap each player’s **head/hat**
   - assign name text
4. Export `roundnet-slot-seeds.json` (contains `seedFrame` + 4 slots).

This seed file is required for stable identity persistence in milestone 1.

## Step 2: mark net points once (clockwise on rim)

```bash
python video-lab/mark_net_points.py \
  --video ~/Desktop/IMG_3742.MOV \
  --output video-lab/output/net_points.json
```

- Click 4 points clockwise around the yellow net rim.
- Press `s` to save.
- Press `r` to reset.

## Step 3: process the video offline

```bash
python video-lab/track_roundnet_session.py \
  --video ~/Desktop/IMG_3742.MOV \
  --output video-lab/output/img_3742.tracking.json \
  --slot-seeds-file video-lab/output/roundnet-slot-seeds.json \
  --net-points-file video-lab/output/net_points.json \
  --write-first-frame video-lab/output/img_3742.first-frame.jpg
```

### Notes

- With slot seeds, names come from the setup export.
- If no net points are supplied, tracking still works but `distanceFeetByPlayer` is `null`.
- Do not commit large videos; only commit scripts/docs/small JSON fixtures when needed.
- Two-people-in-one-box guard: implausibly wide detections are split via a secondary detector or rejected.

## Step 4: review in web UI

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
- Occluded slots stay alive in memory (with predicted hidden location) across multi-second gaps.
- Distance accumulation uses smoothing + minimum movement threshold + max speed gate to suppress jitter/shadow noise.
