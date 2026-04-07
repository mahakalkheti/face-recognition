import cv2
import numpy as np
from pathlib import Path

# Create dummy face images for testing
DATASET_DIR = Path("python/data/dataset")
label = "test_user"
output_dir = DATASET_DIR / label
output_dir.mkdir(parents=True, exist_ok=True)

# Create 10 dummy 160x160 grayscale images
for i in range(10):
    # Create a random image that looks like a face
    img = np.random.randint(50, 200, (160, 160, 3), dtype=np.uint8)
    # Add some face-like features
    cv2.circle(img, (80, 60), 20, (0, 0, 0), -1)  # eyes
    cv2.circle(img, (80, 100), 10, (0, 0, 0), -1)  # nose
    cv2.ellipse(img, (80, 120), (15, 8), 0, 0, 180, (0, 0, 0), -1)  # mouth

    filepath = output_dir / f"{i:03d}.jpg"
    cv2.imwrite(str(filepath), img)
    print(f"Created {filepath}")

print("Dummy dataset created!")