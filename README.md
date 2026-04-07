# Face Recognition Attendance Management System

Yeh project `OpenCV + TensorFlow + Node.js + MongoDB` use karke automatic face recognition attendance system banata hai.

## Features

- Student registry with `faceLabel`
- OpenCV webcam dataset capture
- TensorFlow MobileNetV2 embeddings for face matching
- MongoDB-backed attendance records
- Duplicate attendance prevention per day
- Browser dashboard for student list and attendance table
- Browser live camera access with real-time scan requests to Python recognizer

## Setup

### 1. Node backend

```bash
npm install
npm start
```

MongoDB local machine par run hona chahiye:

```bash
mongodb://127.0.0.1:27017/faceAttendance
```

### 2. Python environment

```bash
npm run setup:python
```

Yeh script automatically:

- `Python 3.12` check/install karti hai
- root me `.venv` banati hai
- `python/requirements.txt` install karti hai

Virtual environment manually activate karna ho to:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Register student and store face from website

Open:

```text
http://localhost:3000
```

Home page par:

- student details bharo
- enrollment camera start karo
- `Capture Face Samples` click karo
- `Save Student And Train Face` click karo

Student add karte waqt `faceLabel` yaad rakho, for example `raj_patel`.

### 4. Attendance page use karo

```bash
npm start
```

Open:

```text
http://localhost:3000/attendance
```

Phir `Start Attendance Camera` click karo. Student jaise hi camera ke saamne aayega, system usko recognize karke aaj ke liye `Present` mark kar dega.

### 5. Optional manual Python tools

```bash
npm run py:capture -- --label raj_patel --samples 40
npm run py:train
npm run py:recognize -- --api-url http://localhost:3000/api/attendance/mark
```

Recognition window me `q` dabake exit kar sakte ho.

## Important note

Yeh educational starter project hai. Production use ke liye better face detector, liveness detection, multi-face support, aur stronger embedding model add karna chahiye.
