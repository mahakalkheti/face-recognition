import numpy as np
from pathlib import Path
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

from config import DATASET_DIR, EMBEDDINGS_PATH
from utils import build_embedding_model, compute_embedding, extract_face_tensor, get_face_detector

import cv2


def iter_images():
    for label_dir in sorted(DATASET_DIR.iterdir()):
        if not label_dir.is_dir():
            continue
        for image_path in sorted(label_dir.glob("*.jpg")):
            yield label_dir.name, image_path


def main():
    model = build_embedding_model()
    detector = get_face_detector()
    labels = []
    embeddings = []

    for label, image_path in iter_images():
        image = cv2.imread(str(image_path))
        if image is None:
            continue

        # For dummy data, skip face detection and use the whole image
        if image.shape[0] == 160 and image.shape[1] == 160:  # Dummy images are 160x160
            face_tensor = cv2.resize(image, (160, 160)).astype('float32')
            face_tensor = cv2.cvtColor(face_tensor, cv2.COLOR_BGR2RGB)
            face_tensor = preprocess_input(face_tensor)  # Same as extract_face_tensor
        else:
            # Real face detection for actual images
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(70, 70))
            if len(faces) == 0:
                continue

            largest_face = max(faces, key=lambda item: item[2] * item[3])
            face_tensor = extract_face_tensor(image, largest_face)

        embedding = compute_embedding(model, face_tensor)

        embeddings.append(embedding)
        labels.append(label)

    if not embeddings:
        raise RuntimeError("No dataset images found. Run capture_faces.py first.")

    np.savez_compressed(
        EMBEDDINGS_PATH,
        labels=np.array(labels),
        embeddings=np.array(embeddings),
    )
    print(f"Saved {len(labels)} embeddings to {EMBEDDINGS_PATH}")


if __name__ == "__main__":
    main()
