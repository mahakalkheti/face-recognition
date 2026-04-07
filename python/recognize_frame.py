import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from config import CONFIDENCE_THRESHOLD, EMBEDDINGS_PATH
from utils import (
    build_embedding_model,
    compute_embedding,
    cosine_similarity,
    detect_largest_face,
    extract_face_tensor,
    get_face_detector,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Recognize a face from a single image")
    parser.add_argument("--image", required=True, help="Path to the image file")
    return parser.parse_args()


def load_embeddings():
    if not EMBEDDINGS_PATH.exists():
        raise RuntimeError("Embeddings file not found. Run train_model.py first.")

    data = np.load(EMBEDDINGS_PATH, allow_pickle=True)
    return data["labels"], data["embeddings"]


def find_best_match(embedding, labels, embeddings):
    scores = [cosine_similarity(embedding, stored) for stored in embeddings]
    if not scores:
        return None, 0.0
    best_index = int(np.argmax(scores))
    return str(labels[best_index]), float(scores[best_index])


def main():
    args = parse_args()
    image_path = Path(args.image)

    if not image_path.exists():
        raise RuntimeError(f"Image not found: {image_path}")

    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError("Unable to read image")

    labels, embeddings = load_embeddings()
    model = build_embedding_model()
    detector = get_face_detector()
    face = detect_largest_face(image, detector)

    if face is None:
        print(json.dumps({"success": True, "matched": False, "message": "No face detected"}))
        return

    face_tensor = extract_face_tensor(image, face)
    embedding = compute_embedding(model, face_tensor)
    label, score = find_best_match(embedding, labels, embeddings)

    if not label or score < CONFIDENCE_THRESHOLD:
        print(
            json.dumps(
                {
                    "success": True,
                    "matched": False,
                    "message": "Unknown face",
                    "confidence": round(score, 4),
                }
            )
        )
        return

    print(
        json.dumps(
            {
                "success": True,
                "matched": True,
                "label": label,
                "confidence": round(score, 4),
                "box": {
                    "x": int(face[0]),
                    "y": int(face[1]),
                    "w": int(face[2]),
                    "h": int(face[3]),
                },
            }
        )
    )


if __name__ == "__main__":
    main()
