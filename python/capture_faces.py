import argparse
from pathlib import Path
import cv2
from config import DATASET_DIR
from utils import detect_largest_face, get_face_detector

def parse_args():
    parser = argparse.ArgumentParser(description="Capture face samples using OpenCV")
    parser.add_argument("--label", required=True, help="Student label, for example raj_patel")
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    parser.add_argument("--samples", type=int, default=40, help="Number of face samples to capture")
    return parser.parse_args()
def main():
    args = parse_args()
    detector = get_face_detector()
    output_dir = Path(DATASET_DIR) / args.label
    output_dir.mkdir(parents=True, exist_ok=True)

    camera = cv2.VideoCapture(args.camera)
    if not camera.isOpened():
        raise RuntimeError("Unable to open camera")

    print(f"Capturing faces for label: {args.label}")
    print("Press q to quit early.")

    captured = 0

    while captured < args.samples:
        success, frame = camera.read()
        if not success:
            continue

        face = detect_largest_face(frame, detector)
        preview = frame.copy()

        if face is not None:
            x, y, w, h = face
            cv2.rectangle(preview, (x, y), (x + w, y + h), (0, 200, 0), 2)

            face_img = frame[y : y + h, x : x + w]
            image_path = output_dir / f"{captured:03d}.jpg"
            cv2.imwrite(str(image_path), face_img)
            captured += 1

        cv2.putText(
            preview,
            f"Captured: {captured}/{args.samples}",
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 255, 255),
            2,
        )
        cv2.imshow("Capture Faces", preview)

        if cv2.waitKey(120) & 0xFF == ord("q"):
            break

    camera.release()
    cv2.destroyAllWindows()
    print(f"Saved samples in {output_dir}")


if __name__ == "__main__":
    main()
