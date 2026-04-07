import argparse
import time
import cv2
import requests
from config import MARK_COOLDOWN_SECONDS
from utils import detect_largest_face, get_face_detector
def parse_args():
    parser = argparse.ArgumentParser(description="Recognize faces and mark attendance")
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    parser.add_argument(
        "--api-url",
        default="http://localhost:3000/api/attendance/mark",
        help="Attendance API endpoint",
    )
    return parser.parse_args()


def mark_attendance(api_url, label, confidence):
    payload = {
        "faceLabel": label,
        "confidence": round(confidence, 4),
    }
    response = requests.post(api_url, json=payload, timeout=10)
    response.raise_for_status()
    return response.json()


def main():
    args = parse_args()
    detector = get_face_detector()
    camera = cv2.VideoCapture(args.camera)

    if not camera.isOpened():
        raise RuntimeError("Unable to open camera")

    recently_marked = {}

    while True:
        success, frame = camera.read()
        if not success:
            continue

        face = detect_largest_face(frame, detector)
        display_text = "No face detected"
        display_color = (0, 120, 255)

        if face is not None:
            x, y, w, h = face
            display_text = "Face detected"
            display_color = (0, 180, 0)
            now = time.time()
            label = "unknown"  # Since no recognition
            last_marked = recently_marked.get(label, 0)

            if now - last_marked > MARK_COOLDOWN_SECONDS:
                try:
                    result = mark_attendance(args.api_url, label, 1.0)  # Dummy confidence
                    recently_marked[label] = now
                    display_text = "Attendance marked"
                except requests.RequestException as error:
                    display_text = f"API error: {error}"
                    display_color = (0, 0, 255)

            cv2.rectangle(frame, (x, y), (x + w, y + h), display_color, 2)
            cv2.putText(
                frame,
                display_text,
                (x, max(y - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                display_color,
                2,
            )

        cv2.imshow("Automatic Attendance Recognition", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
