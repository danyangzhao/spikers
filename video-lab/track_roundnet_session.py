#!/usr/bin/env python3
"""
Offline roundnet session tracker (milestone v2).

Pipeline summary:
1) Runs a person+pose detector with BoT-SORT tracking.
2) Builds four persistent player identities with motion + appearance costs.
3) Uses ankle keypoints for foot position (not hips).
4) Optionally projects image feet onto the ground plane through net-based homography.
5) Writes a JSON artifact for the Next.js review page.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment
from ultralytics import YOLO

NET_DIAMETER_FEET = 3.0
WORLD_NET_POINTS = [
    (0.0, NET_DIAMETER_FEET / 2),
    (NET_DIAMETER_FEET / 2, 0.0),
    (0.0, -NET_DIAMETER_FEET / 2),
    (-NET_DIAMETER_FEET / 2, 0.0),
]
PLAYER_COLORS = ["#2563EB", "#EC4899", "#0F766E", "#DC2626"]


@dataclass
class Detection:
    bbox: Tuple[float, float, float, float]
    confidence: float
    track_id: Optional[int]
    foot_xy: Tuple[float, float]
    foot_confidence: float
    appearance: Optional[np.ndarray]

    @property
    def area(self) -> float:
        x1, y1, x2, y2 = self.bbox
        return max(0.0, x2 - x1) * max(0.0, y2 - y1)


@dataclass
class PlayerState:
    player_id: str
    name: str
    color: str
    initialized: bool = False
    last_position: Optional[Tuple[float, float]] = None
    velocity: Tuple[float, float] = (0.0, 0.0)
    last_frame: Optional[int] = None
    missed: int = 0
    appearance: Optional[np.ndarray] = None
    appearance_updates: int = 0
    known_track_ids: set[int] = field(default_factory=set)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Track 4 roundnet players offline.")
    parser.add_argument("--video", required=True, help="Path to local input video file.")
    parser.add_argument("--output", required=True, help="Path to write output JSON.")
    parser.add_argument(
        "--model",
        default="yolo11m-pose.pt",
        help="Ultralytics pose model (e.g. yolo11m-pose.pt).",
    )
    parser.add_argument(
        "--tracker-config",
        default=str(Path(__file__).parent / "configs" / "botsort_roundnet.yaml"),
        help="Path to tracker yaml (BoT-SORT config).",
    )
    parser.add_argument("--device", default="cpu", help="Inference device, e.g. cpu or 0.")
    parser.add_argument("--conf", type=float, default=0.3, help="Detection confidence threshold.")
    parser.add_argument(
        "--min-box-area-ratio",
        type=float,
        default=0.0025,
        help="Minimum person bbox area ratio (fraction of frame area).",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="Optional cap for debugging. 0 means process full video.",
    )
    parser.add_argument(
        "--player-names",
        default="left,far,near,right",
        help="Comma-separated player names in initial left-to-right order.",
    )
    parser.add_argument(
        "--net-points",
        default="",
        help="Optional 4 image points: 'x1,y1;x2,y2;x3,y3;x4,y4' clockwise on the rim.",
    )
    parser.add_argument(
        "--net-points-file",
        default="",
        help="Optional JSON file containing net points.",
    )
    parser.add_argument(
        "--write-first-frame",
        default="",
        help="Optional JPG path for first frame export.",
    )
    return parser.parse_args()


def parse_player_names(raw: str) -> List[str]:
    names = [name.strip() for name in raw.split(",") if name.strip()]
    if len(names) != 4:
        raise ValueError(
            f"--player-names must contain exactly 4 names, got {len(names)} ({names})."
        )
    return names


def load_video_metadata(video_path: str) -> Tuple[int, int, float, int]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    if fps <= 0:
        fps = 30.0
    return width, height, fps, frame_count


def export_first_frame(video_path: str, output_path: str) -> None:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video to export first frame: {video_path}")
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        raise RuntimeError("Could not read first frame for export.")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output), frame):
        raise RuntimeError(f"Failed writing first frame to {output_path}")


def parse_net_points_string(raw: str) -> List[Tuple[float, float]]:
    chunks = [chunk.strip() for chunk in raw.split(";") if chunk.strip()]
    if len(chunks) != 4:
        raise ValueError("Expected exactly 4 net points in --net-points.")
    points: List[Tuple[float, float]] = []
    for chunk in chunks:
        parts = [part.strip() for part in chunk.split(",")]
        if len(parts) != 2:
            raise ValueError(f"Invalid point '{chunk}'. Expected x,y.")
        points.append((float(parts[0]), float(parts[1])))
    return points


def load_net_points_file(path: str) -> List[Tuple[float, float]]:
    payload = json.loads(Path(path).read_text())
    if isinstance(payload, dict):
        key = "netPointsImage" if "netPointsImage" in payload else "net_points_image"
        points = payload.get(key)
    else:
        points = payload
    if not isinstance(points, list) or len(points) != 4:
        raise ValueError("Net points file must contain 4 points.")
    output: List[Tuple[float, float]] = []
    for point in points:
        if not isinstance(point, Sequence) or len(point) != 2:
            raise ValueError(f"Invalid net point entry: {point}")
        output.append((float(point[0]), float(point[1])))
    return output


def compute_homography_from_net_points(
    image_points: List[Tuple[float, float]],
) -> Optional[np.ndarray]:
    if len(image_points) != 4:
        return None
    src = np.array(image_points, dtype=np.float32)
    dst = np.array(WORLD_NET_POINTS, dtype=np.float32)
    homography, status = cv2.findHomography(src, dst, method=0)
    if homography is None or status is None:
        return None
    return homography


def project_point(point: Tuple[float, float], homography: np.ndarray) -> Optional[Tuple[float, float]]:
    x, y = point
    vec = np.array([x, y, 1.0], dtype=np.float64)
    mapped = homography @ vec
    if abs(mapped[2]) < 1e-9:
        return None
    return (float(mapped[0] / mapped[2]), float(mapped[1] / mapped[2]))


def normalize_feature(feature: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(feature))
    if norm < 1e-8:
        return feature
    return feature / norm


def cosine_distance(a: Optional[np.ndarray], b: Optional[np.ndarray]) -> float:
    if a is None or b is None:
        return 0.5
    a_n = normalize_feature(a)
    b_n = normalize_feature(b)
    dot = float(np.clip(np.dot(a_n, b_n), -1.0, 1.0))
    return 1.0 - ((dot + 1.0) / 2.0)


def clip_bbox(
    bbox: Tuple[float, float, float, float], frame_width: int, frame_height: int
) -> Optional[Tuple[int, int, int, int]]:
    x1, y1, x2, y2 = bbox
    x1_i = int(max(0, min(frame_width - 1, math.floor(x1))))
    y1_i = int(max(0, min(frame_height - 1, math.floor(y1))))
    x2_i = int(max(0, min(frame_width - 1, math.ceil(x2))))
    y2_i = int(max(0, min(frame_height - 1, math.ceil(y2))))
    if x2_i <= x1_i or y2_i <= y1_i:
        return None
    return (x1_i, y1_i, x2_i, y2_i)


def histogram_feature(crop_bgr: np.ndarray) -> np.ndarray:
    if crop_bgr.size == 0:
        return np.zeros(16 * 8 + 3, dtype=np.float32)
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
    hist = cv2.normalize(hist, hist).flatten().astype(np.float32)
    mean_rgb = np.mean(crop_bgr.reshape(-1, 3), axis=0).astype(np.float32) / 255.0
    return np.concatenate([hist, mean_rgb], axis=0)


def extract_appearance_feature(
    frame_bgr: np.ndarray,
    bbox: Tuple[float, float, float, float],
) -> Optional[np.ndarray]:
    frame_height, frame_width = frame_bgr.shape[:2]
    clipped = clip_bbox(bbox, frame_width, frame_height)
    if clipped is None:
        return None
    x1, y1, x2, y2 = clipped
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return None

    h = crop.shape[0]
    head = crop[0 : max(1, int(h * 0.22)), :]
    torso = crop[int(h * 0.2) : max(1, int(h * 0.7)), :]

    feature = np.concatenate([histogram_feature(head), histogram_feature(torso)], axis=0)
    return normalize_feature(feature.astype(np.float32))


def extract_foot_point(
    bbox: Tuple[float, float, float, float],
    keypoints_xy: Optional[np.ndarray],
    keypoints_conf: Optional[np.ndarray],
) -> Tuple[Tuple[float, float], float]:
    if keypoints_xy is not None and keypoints_xy.shape[0] >= 17:
        ankles: List[Tuple[float, float, float]] = []
        for index in (15, 16):
            conf = 1.0 if keypoints_conf is None else float(keypoints_conf[index])
            if conf >= 0.2:
                x, y = float(keypoints_xy[index][0]), float(keypoints_xy[index][1])
                ankles.append((x, y, conf))
        if ankles:
            x = float(sum(item[0] for item in ankles) / len(ankles))
            y = float(sum(item[1] for item in ankles) / len(ankles))
            confidence = max(item[2] for item in ankles)
            return (x, y), confidence

    x1, _, x2, y2 = bbox
    return (float((x1 + x2) / 2.0), float(y2)), 0.15


def collect_detections(
    result,
    frame_bgr: np.ndarray,
    frame_area: float,
    min_box_area_ratio: float,
    min_confidence: float,
) -> List[Detection]:
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return []

    xyxy = boxes.xyxy.cpu().numpy()
    confs = boxes.conf.cpu().numpy()
    classes = boxes.cls.cpu().numpy()

    track_ids: Optional[np.ndarray]
    if boxes.id is None:
        track_ids = None
    else:
        track_ids = boxes.id.cpu().numpy().astype(np.int64)

    keypoints_xy = None
    keypoints_conf = None
    if result.keypoints is not None and len(result.keypoints) > 0:
        keypoints_xy = result.keypoints.xy.cpu().numpy()
        if result.keypoints.conf is not None:
            keypoints_conf = result.keypoints.conf.cpu().numpy()

    output: List[Detection] = []
    for i in range(len(xyxy)):
        cls = int(classes[i])
        if cls != 0:
            continue
        confidence = float(confs[i])
        if confidence < min_confidence:
            continue

        bbox_tuple = tuple(float(value) for value in xyxy[i])
        area = max(0.0, bbox_tuple[2] - bbox_tuple[0]) * max(0.0, bbox_tuple[3] - bbox_tuple[1])
        if area < frame_area * min_box_area_ratio:
            continue

        kp_xy = keypoints_xy[i] if keypoints_xy is not None and i < len(keypoints_xy) else None
        kp_conf = keypoints_conf[i] if keypoints_conf is not None and i < len(keypoints_conf) else None
        foot_xy, foot_conf = extract_foot_point(bbox_tuple, kp_xy, kp_conf)
        appearance = extract_appearance_feature(frame_bgr, bbox_tuple)
        track_id = int(track_ids[i]) if track_ids is not None else None

        output.append(
            Detection(
                bbox=bbox_tuple,  # type: ignore[arg-type]
                confidence=confidence,
                track_id=track_id,
                foot_xy=foot_xy,
                foot_confidence=foot_conf,
                appearance=appearance,
            )
        )

    output.sort(key=lambda det: det.area, reverse=True)
    return output[:8]


def initialize_players(
    players: List[PlayerState],
    detections: List[Detection],
    frame_index: int,
) -> Dict[str, int]:
    chosen = sorted(detections[:4], key=lambda det: det.foot_xy[0])
    assignment: Dict[str, int] = {}
    detection_to_index = {id(det): idx for idx, det in enumerate(detections)}

    for idx, player in enumerate(players):
        det = chosen[idx]
        det_index = detection_to_index[id(det)]
        assignment[player.player_id] = det_index
        player.initialized = True
        player.last_position = det.foot_xy
        player.velocity = (0.0, 0.0)
        player.last_frame = frame_index
        player.missed = 0
        player.appearance = det.appearance
        player.appearance_updates = 1 if det.appearance is not None else 0
        if det.track_id is not None:
            player.known_track_ids.add(det.track_id)

    return assignment


def find_player_by_track_id(players: List[PlayerState], track_id: int) -> Optional[PlayerState]:
    for player in players:
        if track_id in player.known_track_ids:
            return player
    return None


def assign_detections(
    players: List[PlayerState],
    detections: List[Detection],
    frame_index: int,
    frame_diagonal: float,
) -> Dict[str, int]:
    if not detections:
        return {}

    motion_gate_px = 280.0
    appearance_gate = 0.65
    max_total_cost = 1.05
    lock_track_owner_until_missed = 60

    cost_matrix = np.full((len(players), len(detections)), np.inf, dtype=np.float32)

    for p_idx, player in enumerate(players):
        if not player.initialized:
            continue

        predicted = player.last_position
        if player.last_position is not None and player.last_frame is not None:
            dt = max(1, frame_index - player.last_frame)
            dt = min(dt, 20)
            predicted = (
                player.last_position[0] + player.velocity[0] * dt,
                player.last_position[1] + player.velocity[1] * dt,
            )

        for d_idx, detection in enumerate(detections):
            if detection.track_id is not None:
                owner = find_player_by_track_id(players, detection.track_id)
                if (
                    owner is not None
                    and owner.player_id != player.player_id
                    and owner.missed <= lock_track_owner_until_missed
                ):
                    continue

            if predicted is None:
                motion_px = frame_diagonal * 0.15
            else:
                motion_px = math.hypot(
                    predicted[0] - detection.foot_xy[0],
                    predicted[1] - detection.foot_xy[1],
                )

            dynamic_gate = motion_gate_px * (1.0 + min(player.missed, 45) * 0.02)
            if motion_px > dynamic_gate:
                continue

            appearance_cost = cosine_distance(player.appearance, detection.appearance)
            if player.appearance_updates >= 8 and appearance_cost > appearance_gate:
                continue

            motion_cost = min(1.5, motion_px / frame_diagonal)
            stale_penalty = min(0.25, player.missed / 60.0)
            track_bonus = -0.12 if detection.track_id in player.known_track_ids else 0.0
            cost = 0.6 * motion_cost + 0.4 * appearance_cost + stale_penalty + track_bonus
            cost_matrix[p_idx, d_idx] = cost

    row_ids, col_ids = linear_sum_assignment(cost_matrix)
    assignment: Dict[str, int] = {}
    for row_id, col_id in zip(row_ids, col_ids):
        cost = float(cost_matrix[row_id, col_id])
        if not np.isfinite(cost) or cost > max_total_cost:
            continue
        player = players[row_id]
        assignment[player.player_id] = int(col_id)
    return assignment


def update_player_state(player: PlayerState, detection: Detection, frame_index: int) -> None:
    if player.last_position is not None and player.last_frame is not None:
        dt = max(1, frame_index - player.last_frame)
        raw_velocity = (
            (detection.foot_xy[0] - player.last_position[0]) / dt,
            (detection.foot_xy[1] - player.last_position[1]) / dt,
        )
        player.velocity = (
            0.65 * player.velocity[0] + 0.35 * raw_velocity[0],
            0.65 * player.velocity[1] + 0.35 * raw_velocity[1],
        )
    else:
        player.velocity = (0.0, 0.0)

    player.last_position = detection.foot_xy
    player.last_frame = frame_index
    player.missed = 0
    player.initialized = True

    if detection.appearance is not None:
        if player.appearance is None:
            player.appearance = detection.appearance
        else:
            player.appearance = normalize_feature(0.9 * player.appearance + 0.1 * detection.appearance)
        player.appearance_updates += 1

    if detection.track_id is not None:
        player.known_track_ids.add(detection.track_id)


def compute_player_distance_feet(
    player_id: str, frames: List[dict], fps: float
) -> Tuple[Optional[float], List[dict]]:
    min_confidence = 0.35
    min_step_feet = 0.08
    max_speed_feet_per_second = 25.0
    smoothing_alpha = 0.3
    max_gap_frames = 10
    jump_warning_threshold = 6.0

    previous_smooth: Optional[Tuple[float, float]] = None
    previous_frame: Optional[int] = None
    distance = 0.0
    jump_warnings: List[dict] = []
    has_world = False

    for frame in frames:
        observation = frame["players"].get(player_id)
        if not observation or not observation.get("footWorld"):
            previous_smooth = None
            previous_frame = None
            continue

        confidence = float(observation["footConfidence"])
        if confidence < min_confidence:
            previous_smooth = None
            previous_frame = None
            continue

        current_point = (
            float(observation["footWorld"][0]),
            float(observation["footWorld"][1]),
        )
        has_world = True

        if previous_smooth is None or previous_frame is None:
            previous_smooth = current_point
            previous_frame = frame["frame"]
            continue

        frame_gap = int(frame["frame"]) - int(previous_frame)
        if frame_gap <= 0 or frame_gap > max_gap_frames:
            previous_smooth = current_point
            previous_frame = frame["frame"]
            continue

        smoothed = (
            smoothing_alpha * current_point[0] + (1.0 - smoothing_alpha) * previous_smooth[0],
            smoothing_alpha * current_point[1] + (1.0 - smoothing_alpha) * previous_smooth[1],
        )

        step_feet = math.hypot(smoothed[0] - previous_smooth[0], smoothed[1] - previous_smooth[1])
        dt_seconds = frame_gap / fps
        speed = step_feet / dt_seconds if dt_seconds > 0 else float("inf")

        if step_feet >= jump_warning_threshold and frame_gap <= 4:
            jump_warnings.append(
                {
                    "playerId": player_id,
                    "frame": int(frame["frame"]),
                    "jumpFeet": round(step_feet, 3),
                }
            )

        if step_feet >= min_step_feet and speed <= max_speed_feet_per_second:
            distance += step_feet

        previous_smooth = smoothed
        previous_frame = frame["frame"]

    if not has_world:
        return None, jump_warnings
    return float(distance), jump_warnings


def main() -> None:
    args = parse_args()
    video_path = str(Path(args.video).expanduser())
    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    player_names = parse_player_names(args.player_names)

    width, height, fps, expected_frame_count = load_video_metadata(video_path)
    frame_area = float(width * height)
    frame_diagonal = math.hypot(width, height)

    if args.write_first_frame:
        export_first_frame(video_path, str(Path(args.write_first_frame).expanduser()))

    net_points: List[Tuple[float, float]] = []
    if args.net_points_file:
        net_points = load_net_points_file(str(Path(args.net_points_file).expanduser()))
    elif args.net_points:
        net_points = parse_net_points_string(args.net_points)

    homography = compute_homography_from_net_points(net_points) if net_points else None

    model = YOLO(args.model)
    stream = model.track(
        source=video_path,
        stream=True,
        device=args.device,
        tracker=args.tracker_config,
        persist=True,
        classes=[0],
        conf=args.conf,
        verbose=False,
    )

    players = [
        PlayerState(player_id=f"p{index + 1}", name=player_names[index], color=PLAYER_COLORS[index])
        for index in range(4)
    ]

    frames: List[dict] = []
    initialized = False
    bootstrap_frame = -1
    max_frames = int(args.max_frames)

    for frame_index, result in enumerate(stream):
        if max_frames > 0 and frame_index >= max_frames:
            break

        frame_bgr = result.orig_img
        if frame_bgr is None:
            continue

        detections = collect_detections(
            result=result,
            frame_bgr=frame_bgr,
            frame_area=frame_area,
            min_box_area_ratio=float(args.min_box_area_ratio),
            min_confidence=float(args.conf),
        )

        assignments: Dict[str, int] = {}
        if not initialized:
            if len(detections) >= 4:
                assignments = initialize_players(players, detections, frame_index)
                initialized = True
                bootstrap_frame = frame_index
        else:
            assignments = assign_detections(players, detections, frame_index, frame_diagonal)

        frame_payload_players: Dict[str, Optional[dict]] = {}
        for player in players:
            det_index = assignments.get(player.player_id)
            if det_index is None:
                if player.initialized:
                    player.missed += 1
                frame_payload_players[player.player_id] = None
                continue

            detection = detections[det_index]
            update_player_state(player, detection, frame_index)

            world_point: Optional[Tuple[float, float]] = None
            if homography is not None:
                world_point = project_point(detection.foot_xy, homography)

            frame_payload_players[player.player_id] = {
                "visible": True,
                "bbox": [round(value, 3) for value in detection.bbox],
                "footImage": [round(detection.foot_xy[0], 3), round(detection.foot_xy[1], 3)],
                "footWorld": (
                    [round(world_point[0], 4), round(world_point[1], 4)]
                    if world_point is not None
                    else None
                ),
                "footConfidence": round(float(detection.foot_confidence), 4),
                "sourceTrackId": detection.track_id,
                "appearanceScore": (
                    round(1.0 - cosine_distance(player.appearance, detection.appearance), 4)
                    if detection.appearance is not None and player.appearance is not None
                    else None
                ),
            }

        frames.append(
            {
                "frame": frame_index,
                "timeSec": round(frame_index / fps, 4),
                "players": frame_payload_players,
            }
        )

    if not initialized:
        raise RuntimeError(
            "Unable to initialize four players. Ensure at least four players are visible early in the clip."
        )

    missing_frames: Dict[str, int] = {}
    distances: Dict[str, Optional[float]] = {}
    jump_warnings: List[dict] = []
    for player in players:
        missing = sum(1 for frame in frames if frame["players"][player.player_id] is None)
        missing_frames[player.player_id] = int(missing)
        distance_feet, warnings = compute_player_distance_feet(player.player_id, frames, fps)
        distances[player.player_id] = round(distance_feet, 3) if distance_feet is not None else None
        jump_warnings.extend(warnings)

    processed_frame_count = len(frames)
    duration = processed_frame_count / fps if processed_frame_count > 0 else 0.0

    output = {
        "schemaVersion": "roundnet-tracking-v2",
        "generatedAtIso": datetime.now(timezone.utc).isoformat(),
        "sourceVideoPath": video_path,
        "video": {
            "width": width,
            "height": height,
            "fps": round(fps, 6),
            "frameCount": processed_frame_count,
            "durationSec": round(duration, 4),
            "expectedFrameCount": expected_frame_count,
        },
        "calibration": (
            {
                "netDiameterFeet": NET_DIAMETER_FEET,
                "netPointsImage": [[round(p[0], 3), round(p[1], 3)] for p in net_points],
                "netPointsWorld": [[p[0], p[1]] for p in WORLD_NET_POINTS],
                "homographyImageToWorld": [
                    [round(float(value), 10) for value in row] for row in homography.tolist()
                ],
            }
            if homography is not None
            else None
        ),
        "players": [
            {
                "id": player.player_id,
                "name": player.name,
                "color": player.color,
            }
            for player in players
        ],
        "frames": frames,
        "distanceFeetByPlayer": distances,
        "diagnostics": {
            "bootstrapFrame": bootstrap_frame,
            "missingFramesByPlayer": missing_frames,
            "jumpWarnings": jump_warnings,
        },
    }

    output_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote tracking output to {output_path}")


if __name__ == "__main__":
    main()
