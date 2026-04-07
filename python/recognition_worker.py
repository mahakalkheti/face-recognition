import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

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


def recognize_image(model, detector, labels, embeddings, image_path):
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError("Unable to read image")

    face = detect_largest_face(image, detector)
    if face is None:
        return {"success": True, "matched": False, "message": "No face detected"}

    face_tensor = extract_face_tensor(image, face)
    embedding = compute_embedding(model, face_tensor)
    label, score = find_best_match(embedding, labels, embeddings)

    if not label or score < CONFIDENCE_THRESHOLD:
        return {
            "success": True,
            "matched": False,
            "message": "Unknown face",
            "confidence": round(score, 4),
        }

    return {
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


def emit(payload):
    print(json.dumps(payload), flush=True)


def main():
    try:
        model = build_embedding_model()
        detector = get_face_detector()
        labels, embeddings = load_embeddings()
        emit({"type": "ready"})
    except Exception as error:
        emit({"type": "fatal", "message": str(error)})
        return

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = request["id"]
            image_path = Path(request["imagePath"])
            result = recognize_image(model, detector, labels, embeddings, image_path)
            emit({"type": "result", "id": request_id, "result": result})
        except Exception as error:
            emit(
                {
                    "type": "result",
                    "id": request.get("id") if "request" in locals() else None,
                    "result": {"success": False, "message": str(error)},
                }
            )


if __name__ == "__main__":
    main()
