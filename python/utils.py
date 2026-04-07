from __future__ import annotations

from pathlib import Path
from typing import Iterable, Tuple

import cv2
import numpy as np
import tensorflow as tf
from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input

from config import IMAGE_SIZE


def get_face_detector() -> cv2.CascadeClassifier:
    cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(str(cascade_path))
    if detector.empty():
        raise RuntimeError("Failed to load Haar cascade for face detection")
    return detector


def build_embedding_model() -> tf.keras.Model:
    base_model = MobileNetV2(
        include_top=False,
        pooling="avg",
        weights="imagenet",
        input_shape=(IMAGE_SIZE[0], IMAGE_SIZE[1], 3),
    )
    base_model.trainable = False
    return base_model


def detect_largest_face(frame: np.ndarray, detector: cv2.CascadeClassifier) -> Tuple[int, int, int, int] | None:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = detector.detectMultiScale(
        gray,
        scaleFactor=1.2,
        minNeighbors=5,
        minSize=(90, 90),
    )
    if len(faces) == 0:
        return None
    return max(faces, key=lambda item: item[2] * item[3])


def extract_face_tensor(frame: np.ndarray, face_box: Iterable[int]) -> np.ndarray:
    x, y, w, h = [int(value) for value in face_box]
    face = frame[y : y + h, x : x + w]
    face = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
    face = cv2.resize(face, IMAGE_SIZE)
    face = face.astype("float32")
    return preprocess_input(face)


def compute_embedding(model: tf.keras.Model, face_tensor: np.ndarray) -> np.ndarray:
    batch = np.expand_dims(face_tensor, axis=0)
    embedding = model.predict(batch, verbose=0)[0]
    norm = np.linalg.norm(embedding)
    return embedding / norm if norm else embedding


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    left_norm = left / np.linalg.norm(left)
    right_norm = right / np.linalg.norm(right)
    return float(np.dot(left_norm, right_norm))
