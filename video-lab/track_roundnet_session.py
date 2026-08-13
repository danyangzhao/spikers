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
    head_xy: Optional[Tuple[float, float]]

    @property
    def area(self) -> float:
        x1, y1, x2, y2 = self.bbox
        return max(0.0, x2 - x1) * max(0.0, y2 - y1)

    @property
    def width(self) -> float:
        x1, _, x2, _ = self.bbox
        return max(0.0, x2 - x1)

    @property
    def height(self) -> float:
        _, y1, _, y2 = self.bbox
        return max(0.0, y2 - y1)

    @property
    def aspect_ratio(self) -> float:
        return self.width / max(1.0, self.height)


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
    occluded_by: Optional[str] = None
    occlusion_offset: Optional[Tuple[float, float]] = None


@dataclass
class SlotSeed:
    slot_id: str
    name: str
    head_point_image: Tuple[float, float]


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
        "--slot-seeds-file",
        default="",
        help=(
            "Optional JSON file from /video-lab/setup containing 4 tapped identity slots. "
            "When set, tracker seeds identities from this frame and never mints more slots."
        ),
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
    parser.add_argument(
        "--split-detector-model",
        default="yolo11n.pt",
        help="Secondary detector model used to split implausibly wide merged person boxes.",
    )
    return parser.parse_args()


def parse_player_names(raw: str) -> List[str]:
    names = [name.strip() for name in raw.split(",") if name.strip()]
    if len(names) != 4:
        raise ValueError(
            f"--player-names must contain exactly 4 names, got {len(names)} ({names})."
        )
    return names


def load_slot_seeds_file(path: str) -> Tuple[int, List[SlotSeed]]:
    payload = json.loads(Path(path).read_text())
    if not isinstance(payload, dict):
        raise ValueError("Slot seeds file must be a JSON object.")

    seed_frame_raw = payload.get("seedFrame")
    if not isinstance(seed_frame_raw, (int, float)):
        raise ValueError("Slot seeds file must include numeric seedFrame.")
    seed_frame = int(seed_frame_raw)
    if seed_frame < 0:
        raise ValueError("seedFrame must be >= 0.")

    slots_raw = payload.get("slots")
    if not isinstance(slots_raw, list) or len(slots_raw) != 4:
        raise ValueError("Slot seeds file must include exactly 4 slots.")

    slots: List[SlotSeed] = []
    seen_ids: set[str] = set()
    for item in slots_raw:
        if not isinstance(item, dict):
            raise ValueError(f"Invalid slot entry: {item}")
        slot_id = str(item.get("slotId", "")).strip()
        name = str(item.get("name", slot_id)).strip() or slot_id
        point = item.get("headPointImage")
        if slot_id not in {"p1", "p2", "p3", "p4"}:
            raise ValueError(f"slotId must be one of p1..p4. Received: {slot_id}")
        if slot_id in seen_ids:
            raise ValueError(f"Duplicate slotId in slot seeds file: {slot_id}")
        if not isinstance(point, Sequence) or len(point) != 2:
            raise ValueError(f"slot {slot_id} must include headPointImage [x,y].")
        slots.append(
            SlotSeed(
                slot_id=slot_id,
                name=name,
                head_point_image=(float(point[0]), float(point[1])),
            )
        )
        seen_ids.add(slot_id)

    slots.sort(key=lambda slot: slot.slot_id)
    return seed_frame, slots


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


def histogram_feature(crop_bgr: np.ndarray, bins_h: int = 24, bins_s: int = 12) -> np.ndarray:
    if crop_bgr.size == 0:
        return np.zeros(bins_h * bins_s + 3, dtype=np.float32)
    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [bins_h, bins_s], [0, 180, 0, 256])
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
    w = crop.shape[1]
    head = crop[0 : max(1, int(h * 0.33)), :]
    hat_patch = crop[0 : max(1, int(h * 0.2)), int(w * 0.18) : max(int(w * 0.82), int(w * 0.18) + 1)]
    lower_body = crop[int(h * 0.58) : max(int(h * 0.58) + 1, h), :]

    head_feature = histogram_feature(head)
    hat_feature = histogram_feature(hat_patch)
    lower_feature = histogram_feature(lower_body)
    shape_feature = np.array([w / max(h, 1), h / max(w, 1)], dtype=np.float32)

    # Head/hat is dominant for this clip (3 players wear white tops).
    feature = np.concatenate(
        [
            2.8 * head_feature,
            2.0 * hat_feature,
            0.35 * lower_feature,
            0.25 * shape_feature,
        ],
        axis=0,
    )
    return normalize_feature(feature.astype(np.float32))


def extract_head_point(
    bbox: Tuple[float, float, float, float],
    keypoints_xy: Optional[np.ndarray],
    keypoints_conf: Optional[np.ndarray],
) -> Optional[Tuple[float, float]]:
    if keypoints_xy is not None and keypoints_xy.shape[0] >= 5:
        indices = [0, 1, 2, 3, 4]  # nose, eyes, ears
        weighted: List[Tuple[float, float, float]] = []
        for idx in indices:
            conf = 1.0 if keypoints_conf is None else float(keypoints_conf[idx])
            if conf >= 0.2:
                x, y = float(keypoints_xy[idx][0]), float(keypoints_xy[idx][1])
                weighted.append((x, y, conf))
        if weighted:
            total = sum(item[2] for item in weighted)
            x = sum(item[0] * item[2] for item in weighted) / max(total, 1e-6)
            y = sum(item[1] * item[2] for item in weighted) / max(total, 1e-6)
            return (float(x), float(y))

    x1, y1, x2, y2 = bbox
    return (float((x1 + x2) / 2.0), float(y1 + (y2 - y1) * 0.15))


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
    split_detector: Optional[YOLO],
    frame_width: int,
    frame_height: int,
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
        head_xy = extract_head_point(bbox_tuple, kp_xy, kp_conf)
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
                head_xy=head_xy,
            )
        )

    output = refine_detections_for_merged_people(
        detections=output,
        frame_bgr=frame_bgr,
        split_detector=split_detector,
        frame_width=frame_width,
        frame_height=frame_height,
        frame_area=frame_area,
        min_box_area_ratio=min_box_area_ratio,
        min_confidence=min_confidence,
    )

    output.sort(key=lambda det: det.area, reverse=True)
    return output[:10]


def refine_detections_for_merged_people(
    detections: List[Detection],
    frame_bgr: np.ndarray,
    split_detector: Optional[YOLO],
    frame_width: int,
    frame_height: int,
    frame_area: float,
    min_box_area_ratio: float,
    min_confidence: float,
) -> List[Detection]:
    if not detections:
        return detections

    refined: List[Detection] = []
    for detection in detections:
        should_try_split = (
            detection.aspect_ratio > 1.18
            or detection.width > frame_width * 0.26
            or (detection.width > 200 and detection.height < 190)
        )
        if not should_try_split or split_detector is None:
            if not is_implausibly_wide_unsplittable(detection, frame_width):
                refined.append(detection)
            continue

        split_candidates = split_wide_detection(
            frame_bgr=frame_bgr,
            detection=detection,
            split_detector=split_detector,
            frame_area=frame_area,
            min_box_area_ratio=min_box_area_ratio,
            min_confidence=min_confidence,
            frame_width=frame_width,
            frame_height=frame_height,
        )
        if len(split_candidates) >= 2:
            refined.extend(split_candidates)
        elif not is_implausibly_wide_unsplittable(detection, frame_width):
            refined.append(detection)

    return refined


def is_implausibly_wide_unsplittable(detection: Detection, frame_width: int) -> bool:
    return detection.aspect_ratio > 1.45 and detection.width > frame_width * 0.22


def split_wide_detection(
    frame_bgr: np.ndarray,
    detection: Detection,
    split_detector: YOLO,
    frame_area: float,
    min_box_area_ratio: float,
    min_confidence: float,
    frame_width: int,
    frame_height: int,
) -> List[Detection]:
    clipped = clip_bbox(detection.bbox, frame_width, frame_height)
    if clipped is None:
        return []
    x1, y1, x2, y2 = clipped
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return []

    split_conf = max(0.12, min_confidence * 0.5)
    split_results = split_detector.predict(
        source=crop,
        conf=split_conf,
        classes=[0],
        iou=0.45,
        verbose=False,
    )
    if not split_results:
        return []

    boxes = split_results[0].boxes
    if boxes is None or len(boxes) < 2:
        return []

    xyxy = boxes.xyxy.cpu().numpy()
    confs = boxes.conf.cpu().numpy()
    split_detections: List[Detection] = []

    for idx in range(len(xyxy)):
        conf = float(confs[idx])
        if conf < split_conf:
            continue
        local = xyxy[idx]
        global_bbox = (
            float(local[0] + x1),
            float(local[1] + y1),
            float(local[2] + x1),
            float(local[3] + y1),
        )
        area = max(0.0, global_bbox[2] - global_bbox[0]) * max(0.0, global_bbox[3] - global_bbox[1])
        if area < frame_area * min_box_area_ratio * 0.35:
            continue

        foot = ((global_bbox[0] + global_bbox[2]) / 2.0, global_bbox[3])
        appearance = extract_appearance_feature(frame_bgr, global_bbox)
        split_detections.append(
            Detection(
                bbox=global_bbox,
                confidence=conf,
                track_id=None,
                foot_xy=(float(foot[0]), float(foot[1])),
                foot_confidence=0.2,
                appearance=appearance,
                head_xy=(float((global_bbox[0] + global_bbox[2]) / 2.0), float(global_bbox[1])),
            )
        )

    split_detections.sort(key=lambda item: item.area, reverse=True)
    if len(split_detections) < 2:
        return []
    return split_detections[:3]


def initialize_players_from_slot_seeds(
    players: List[PlayerState],
    detections: List[Detection],
    slots: List[SlotSeed],
    frame_index: int,
) -> Dict[str, int]:
    assignment: Dict[str, int] = {}
    used_detection_indices: set[int] = set()
    by_id = {player.player_id: player for player in players}

    for slot in slots:
        player = by_id.get(slot.slot_id)
        if player is None:
            continue

        best_index = -1
        best_cost = float("inf")
        seed_x, seed_y = slot.head_point_image
        for det_index, detection in enumerate(detections):
            if det_index in used_detection_indices:
                continue
            head_x, head_y = detection.head_xy or (
                (detection.bbox[0] + detection.bbox[2]) / 2.0,
                detection.bbox[1] + detection.height * 0.12,
            )
            distance = math.hypot(seed_x - head_x, seed_y - head_y)
            if distance < best_cost:
                best_cost = distance
                best_index = det_index

        if best_index < 0:
            raise RuntimeError(f"No detection available for seeded slot {slot.slot_id}.")
        if best_cost > 180:
            raise RuntimeError(
                f"Seeded slot {slot.slot_id} is too far ({best_cost:.1f}px) from any detected head."
            )

        assignment[slot.slot_id] = best_index
        used_detection_indices.add(best_index)

        player.name = slot.name
        detection = detections[best_index]
        player.initialized = True
        player.last_position = detection.foot_xy
        player.velocity = (0.0, 0.0)
        player.last_frame = frame_index
        player.missed = 0
        player.appearance = detection.appearance
        player.appearance_updates = 1 if detection.appearance is not None else 0
        player.occluded_by = None
        player.occlusion_offset = None
        if detection.track_id is not None:
            player.known_track_ids.add(detection.track_id)

    if len(assignment) != 4:
        missing = [player.player_id for player in players if player.player_id not in assignment]
        raise RuntimeError(f"Failed to initialize all 4 seeded slots. Missing: {missing}")
    return assignment


def initialize_players_by_left_to_right(
    players: List[PlayerState],
    detections: List[Detection],
    frame_index: int,
) -> Dict[str, int]:
    chosen = sorted(detections[:4], key=lambda det: det.foot_xy[0])
    assignment: Dict[str, int] = {}
    detection_to_index = {id(det): idx for idx, det in enumerate(detections)}

    for idx, player in enumerate(players):
        detection = chosen[idx]
        det_index = detection_to_index[id(detection)]
        assignment[player.player_id] = det_index
        player.initialized = True
        player.last_position = detection.foot_xy
        player.velocity = (0.0, 0.0)
        player.last_frame = frame_index
        player.missed = 0
        player.appearance = detection.appearance
        player.appearance_updates = 1 if detection.appearance is not None else 0
        player.occluded_by = None
        player.occlusion_offset = None
        if detection.track_id is not None:
            player.known_track_ids.add(detection.track_id)

    return assignment


def find_player_by_track_id(players: List[PlayerState], track_id: int) -> Optional[PlayerState]:
    for player in players:
        if track_id in player.known_track_ids:
            return player
    return None


def predict_player_position(
    player: PlayerState,
    frame_index: int,
    players_by_id: Dict[str, PlayerState],
) -> Optional[Tuple[float, float]]:
    if player.last_position is None:
        return None

    if player.occluded_by and player.occlusion_offset is not None:
        occluder = players_by_id.get(player.occluded_by)
        if occluder and occluder.last_position is not None:
            return (
                occluder.last_position[0] + player.occlusion_offset[0],
                occluder.last_position[1] + player.occlusion_offset[1],
            )

    if player.last_frame is None:
        return player.last_position
    dt = max(1, frame_index - player.last_frame)
    dt = min(dt, 45)
    return (
        player.last_position[0] + player.velocity[0] * dt,
        player.last_position[1] + player.velocity[1] * dt,
    )


def point_inside_bbox(point: Tuple[float, float], bbox: Tuple[float, float, float, float], margin: float = 0.0) -> bool:
    x, y = point
    x1, y1, x2, y2 = bbox
    return (x1 - margin) <= x <= (x2 + margin) and (y1 - margin) <= y <= (y2 + margin)


def assign_detections(
    players: List[PlayerState],
    detections: List[Detection],
    frame_index: int,
    frame_diagonal: float,
) -> Tuple[Dict[str, int], Dict[str, Tuple[float, float]]]:
    if not detections:
        return {}, {}

    motion_gate_px = 320.0
    max_total_cost = 1.15
    lock_track_owner_until_missed = 180
    reacquire_appearance_gate = 0.5

    cost_matrix = np.full((len(players), len(detections)), np.inf, dtype=np.float32)
    players_by_id = {player.player_id: player for player in players}
    predicted_by_player: Dict[str, Tuple[float, float]] = {}

    ambiguous_detection_indices: set[int] = set()
    for det_index, detection in enumerate(detections):
        if detection.aspect_ratio < 1.14:
            continue
        contained_predictions = 0
        for player in players:
            predicted = predict_player_position(player, frame_index, players_by_id)
            if predicted is None:
                continue
            if point_inside_bbox(predicted, detection.bbox, margin=16):
                contained_predictions += 1
        if contained_predictions >= 2:
            ambiguous_detection_indices.add(det_index)

    for p_idx, player in enumerate(players):
        if not player.initialized:
            continue

        predicted = predict_player_position(player, frame_index, players_by_id)
        if predicted is not None:
            predicted_by_player[player.player_id] = predicted

        for d_idx, detection in enumerate(detections):
            if d_idx in ambiguous_detection_indices:
                # Wide merged detections are frequently two players in one box; do not let one slot steal it.
                continue

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

            dynamic_gate = motion_gate_px * (1.0 + min(player.missed, 150) * 0.012)
            if motion_px > dynamic_gate:
                continue

            appearance_cost = cosine_distance(player.appearance, detection.appearance)
            if player.appearance_updates >= 5:
                hard_gate = reacquire_appearance_gate + min(player.missed, 90) * 0.0018
                if appearance_cost > hard_gate:
                    continue

            motion_cost = min(1.6, motion_px / frame_diagonal)
            stale_penalty = min(0.35, player.missed / 180.0)
            track_bonus = -0.16 if detection.track_id in player.known_track_ids else 0.0

            # Identity persistence prioritizes head/hat appearance over nearest-foot heuristics.
            if player.missed >= 18 or player.occluded_by is not None:
                appearance_weight = 0.84
                motion_weight = 0.16
            else:
                appearance_weight = 0.7
                motion_weight = 0.3

            if player.occluded_by is not None and player.appearance_updates >= 5 and appearance_cost > 0.56:
                continue

            cost = (
                motion_weight * motion_cost
                + appearance_weight * appearance_cost
                + stale_penalty
                + track_bonus
            )
            cost_matrix[p_idx, d_idx] = cost

    row_ids, col_ids = linear_sum_assignment(cost_matrix)
    assignment: Dict[str, int] = {}
    for row_id, col_id in zip(row_ids, col_ids):
        cost = float(cost_matrix[row_id, col_id])
        if not np.isfinite(cost) or cost > max_total_cost:
            continue
        player = players[row_id]
        assignment[player.player_id] = int(col_id)
    return assignment, predicted_by_player


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
    player.occluded_by = None
    player.occlusion_offset = None

    if detection.appearance is not None:
        if player.appearance is None:
            player.appearance = detection.appearance
        else:
            player.appearance = normalize_feature(0.9 * player.appearance + 0.1 * detection.appearance)
        player.appearance_updates += 1

    if detection.track_id is not None:
        player.known_track_ids.add(detection.track_id)


def update_unmatched_player_state(
    player: PlayerState,
    players_by_id: Dict[str, PlayerState],
    frame_index: int,
    matched_observations: Dict[str, Detection],
    predicted_position: Optional[Tuple[float, float]],
) -> None:
    player.missed += 1
    if predicted_position is not None:
        player.last_position = predicted_position
        player.last_frame = frame_index
    player.velocity = (player.velocity[0] * 0.94, player.velocity[1] * 0.94)

    if predicted_position is None:
        player.occluded_by = None
        player.occlusion_offset = None
        return

    chosen_occluder: Optional[str] = None
    for occluder_id, detection in matched_observations.items():
        if occluder_id == player.player_id:
            continue
        if point_inside_bbox(predicted_position, detection.bbox, margin=20):
            chosen_occluder = occluder_id
            break

    if chosen_occluder is None:
        player.occluded_by = None
        player.occlusion_offset = None
        return

    occluder_player = players_by_id.get(chosen_occluder)
    if occluder_player is None or occluder_player.last_position is None:
        return

    player.occluded_by = chosen_occluder
    player.occlusion_offset = (
        predicted_position[0] - occluder_player.last_position[0],
        predicted_position[1] - occluder_player.last_position[1],
    )


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
        if not observation or not observation.get("visible") or not observation.get("footWorld"):
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
    slot_seed_frame: Optional[int] = None
    slot_seeds: List[SlotSeed] = []
    if args.slot_seeds_file:
        slot_seed_frame, slot_seeds = load_slot_seeds_file(str(Path(args.slot_seeds_file).expanduser()))
        seed_names_by_slot = {slot.slot_id: slot.name for slot in slot_seeds}
        player_names = [seed_names_by_slot.get(f"p{i+1}", player_names[i]) for i in range(4)]

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
    split_detector = YOLO(args.split_detector_model) if args.split_detector_model else None
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
    players_by_id = {player.player_id: player for player in players}

    for frame_index, result in enumerate(stream):
        if max_frames > 0 and frame_index >= max_frames:
            break

        frame_bgr = result.orig_img
        if frame_bgr is None:
            continue

        detections = collect_detections(
            result=result,
            frame_bgr=frame_bgr,
            split_detector=split_detector,
            frame_width=width,
            frame_height=height,
            frame_area=frame_area,
            min_box_area_ratio=float(args.min_box_area_ratio),
            min_confidence=float(args.conf),
        )

        assignments: Dict[str, int] = {}
        predicted_by_player: Dict[str, Tuple[float, float]] = {}
        if not initialized:
            if slot_seeds:
                if slot_seed_frame is not None and frame_index < slot_seed_frame:
                    assignments = {}
                elif slot_seed_frame is not None and frame_index == slot_seed_frame:
                    assignments = initialize_players_from_slot_seeds(
                        players=players,
                        detections=detections,
                        slots=slot_seeds,
                        frame_index=frame_index,
                    )
                    initialized = True
                    bootstrap_frame = frame_index
                else:
                    if slot_seed_frame is not None and frame_index > slot_seed_frame:
                        raise RuntimeError(
                            "Seed frame passed without successful initialization. "
                            "Re-export slot seeds on a clearer frame."
                        )
            elif len(detections) >= 4:
                assignments = initialize_players_by_left_to_right(players, detections, frame_index)
                initialized = True
                bootstrap_frame = frame_index
        else:
            assignments, predicted_by_player = assign_detections(players, detections, frame_index, frame_diagonal)

        matched_observations: Dict[str, Detection] = {}
        for player_id, det_index in assignments.items():
            if 0 <= det_index < len(detections):
                matched_observations[player_id] = detections[det_index]

        frame_payload_players: Dict[str, Optional[dict]] = {}
        for player in players:
            det_index = assignments.get(player.player_id)
            if det_index is None:
                predicted = predicted_by_player.get(player.player_id)
                if player.initialized:
                    update_unmatched_player_state(
                        player=player,
                        players_by_id=players_by_id,
                        frame_index=frame_index,
                        matched_observations=matched_observations,
                        predicted_position=predicted,
                    )

                predicted_foot = player.last_position if player.initialized else None
                frame_payload_players[player.player_id] = {
                    "visible": False,
                    "state": "occluded" if player.occluded_by else "missing",
                    "bbox": None,
                    "footImage": None,
                    "predictedFootImage": (
                        [round(predicted_foot[0], 3), round(predicted_foot[1], 3)]
                        if predicted_foot is not None
                        else None
                    ),
                    "footWorld": (
                        (
                            [round(world[0], 4), round(world[1], 4)]
                            if (world := project_point(predicted_foot, homography)) is not None
                            else None
                        )
                        if predicted_foot is not None and homography is not None
                        else None
                    ),
                    "footConfidence": 0.0,
                    "sourceTrackId": None,
                    "appearanceScore": None,
                    "occludedBy": player.occluded_by,
                }
                continue

            detection = detections[det_index]
            update_player_state(player, detection, frame_index)

            world_point: Optional[Tuple[float, float]] = None
            if homography is not None:
                world_point = project_point(detection.foot_xy, homography)

            frame_payload_players[player.player_id] = {
                "visible": True,
                "state": "visible",
                "bbox": [round(value, 3) for value in detection.bbox],
                "footImage": [round(detection.foot_xy[0], 3), round(detection.foot_xy[1], 3)],
                "predictedFootImage": None,
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
                "occludedBy": None,
            }

        frames.append(
            {
                "frame": frame_index,
                "timeSec": round(frame_index / fps, 4),
                "players": frame_payload_players,
            }
        )

    if not initialized:
        if slot_seeds:
            raise RuntimeError(
                "Unable to initialize seeded slots. Ensure the seed frame has four visible heads and rerun setup."
            )
        raise RuntimeError(
            "Unable to initialize four players. Provide --slot-seeds-file or ensure four players are visible early."
        )

    missing_frames: Dict[str, int] = {}
    occluded_frames: Dict[str, int] = {}
    distances: Dict[str, Optional[float]] = {}
    jump_warnings: List[dict] = []
    for player in players:
        missing = sum(
            1
            for frame in frames
            if not frame["players"][player.player_id]
            or frame["players"][player.player_id]["state"] == "missing"
        )
        occluded = sum(
            1
            for frame in frames
            if frame["players"][player.player_id]
            and frame["players"][player.player_id]["state"] == "occluded"
        )
        missing_frames[player.player_id] = int(missing)
        occluded_frames[player.player_id] = int(occluded)
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
            "slotSeedFrame": slot_seed_frame,
            "slotCount": 4,
            "missingFramesByPlayer": missing_frames,
            "occludedFramesByPlayer": occluded_frames,
            "jumpWarnings": jump_warnings,
        },
    }

    output_path.write_text(json.dumps(output, indent=2))
    print(f"Wrote tracking output to {output_path}")


if __name__ == "__main__":
    main()
