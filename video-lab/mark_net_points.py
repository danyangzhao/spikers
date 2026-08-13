#!/usr/bin/env python3
"""
Interactive helper to capture 4 net rim points from a local video frame.

Usage:
  python video-lab/mark_net_points.py \
    --video ~/Desktop/IMG_3742.MOV \
    --output video-lab/output/net_points.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Tuple

import cv2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Mark 4 net points in clockwise order.")
    parser.add_argument("--video", required=True, help="Input video path.")
    parser.add_argument("--output", required=True, help="Output JSON path.")
    parser.add_argument(
        "--frame-index",
        type=int,
        default=0,
        help="Frame index to load before marking points.",
    )
    return parser.parse_args()


def load_frame(video_path: str, frame_index: int):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        raise RuntimeError(f"Could not read frame {frame_index} from {video_path}")
    return frame


def draw_overlay(base_frame, points: List[Tuple[int, int]]):
    frame = base_frame.copy()
    for idx, (x, y) in enumerate(points, start=1):
        cv2.circle(frame, (x, y), 6, (0, 255, 255), -1)
        cv2.putText(
            frame,
            str(idx),
            (x + 10, y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )
    cv2.putText(
        frame,
        "Click 4 net rim points clockwise. Press s=save, r=reset, q=quit",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    return frame


def main() -> None:
    args = parse_args()
    video_path = str(Path(args.video).expanduser())
    output_path = Path(args.output).expanduser()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    base_frame = load_frame(video_path, int(args.frame_index))
    points: List[Tuple[int, int]] = []

    window_name = "Roundnet Net Calibration"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)

    def on_mouse(event, x, y, _flags, _param):
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 4:
            points.append((int(x), int(y)))

    cv2.setMouseCallback(window_name, on_mouse)

    while True:
        cv2.imshow(window_name, draw_overlay(base_frame, points))
        key = cv2.waitKey(20) & 0xFF

        if key == ord("q"):
            break
        if key == ord("r"):
            points.clear()
        if key == ord("s"):
            if len(points) != 4:
                print("Need exactly 4 points before saving.")
                continue
            payload = {
                "netPointsImage": [[float(x), float(y)] for x, y in points],
                "frameIndex": int(args.frame_index),
                "videoPath": video_path,
                "instructions": "Points were clicked clockwise on the net rim.",
            }
            output_path.write_text(json.dumps(payload, indent=2))
            print(f"Saved net points to {output_path}")
            break

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
