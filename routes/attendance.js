const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const Attendance = require('../models/Attendance');
const Student = require('../models/Student');

const router = express.Router();
const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || DEFAULT_VENV_PYTHON;
const RECOGNIZE_WORKER = path.join(PROJECT_ROOT, 'python', 'recognition_worker.py');
let workerProcess = null;
let workerReadyPromise = null;
let workerStdoutBuffer = '';
let lastWorkerError = '';
let nextRequestId = 1;
const pendingRecognitions = new Map();

async function markAttendanceForLabel(faceLabel, confidence = 0, markedAt) {
  const student = await Student.findOne({ faceLabel });

  if (!student) {
    return {
      status: 404,
      body: {
        success: false,
        message: `No student found for label ${faceLabel}`,
      },
    };
  }

  const attendanceTime = markedAt ? new Date(markedAt) : new Date();
  const dateKey = attendanceTime.toISOString().slice(0, 10);

  const existing = await Attendance.findOne({
    student: student._id,
    dateKey,
  }).lean();

  if (existing) {
    return {
      status: 200,
      body: {
        success: true,
        duplicate: true,
        message: 'Attendance already marked for today',
        record: existing,
      },
    };
  }

  const record = await Attendance.create({
    student: student._id,
    faceLabel,
    confidence,
    markedAt: attendanceTime,
    dateKey,
  });

  const populated = await Attendance.findById(record._id).populate('student').lean();

  return {
    status: 201,
    body: {
      success: true,
      duplicate: false,
      message: 'Attendance marked successfully',
      record: populated,
    },
  };
}

async function runRecognition(imageBuffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attendance-scan-'));
  const imagePath = path.join(tempDir, 'frame.jpg');

  try {
    await fs.writeFile(imagePath, imageBuffer);
    const worker = await getWorkerProcess();
    const requestId = String(nextRequestId++);

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRecognitions.delete(requestId);
        reject(new Error('Recognition timed out'));
      }, 120000);

      pendingRecognitions.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      worker.stdin.write(`${JSON.stringify({ id: requestId, imagePath })}\n`);
    });

    return result;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function rejectPendingRecognitions(message) {
  for (const [requestId, pending] of pendingRecognitions.entries()) {
    pending.reject(new Error(message));
    pendingRecognitions.delete(requestId);
  }
}

function handleWorkerMessage(rawLine) {
  let message;

  try {
    message = JSON.parse(rawLine);
  } catch (error) {
    return;
  }

  if (message.type === 'result' && message.id) {
    const pending = pendingRecognitions.get(String(message.id));
    if (!pending) {
      return;
    }

    pendingRecognitions.delete(String(message.id));
    pending.resolve(message.result);
  }
}

function createWorkerProcess() {
  workerProcess = spawn(PYTHON_EXECUTABLE, [RECOGNIZE_WORKER], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  workerProcess.stdout.setEncoding('utf8');
  workerProcess.stdout.on('data', (chunk) => {
    workerStdoutBuffer += chunk;
    const lines = workerStdoutBuffer.split(/\r?\n/);
    workerStdoutBuffer = lines.pop() || '';

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      try {
        const message = JSON.parse(trimmed);
        if (message.type === 'ready') {
          if (workerReadyPromise) {
            workerReadyPromise.resolve(workerProcess);
            workerReadyPromise = null;
          }
          return;
        }

        if (message.type === 'fatal') {
          const fatalError = new Error(message.message || 'Recognition worker failed to start');
          if (workerReadyPromise) {
            workerReadyPromise.reject(fatalError);
            workerReadyPromise = null;
          }
          rejectPendingRecognitions(fatalError.message);
          return;
        }

        handleWorkerMessage(trimmed);
      } catch (error) {
      }
    });
  });

  workerProcess.stderr.setEncoding('utf8');
  workerProcess.stderr.on('data', (chunk) => {
    lastWorkerError += chunk;
  });

  workerProcess.on('error', (error) => {
    if (workerReadyPromise) {
      workerReadyPromise.reject(error);
      workerReadyPromise = null;
    }
    rejectPendingRecognitions(error.message);
    workerProcess = null;
  });

  workerProcess.on('exit', (code) => {
    const reason = lastWorkerError.trim() || `Recognition worker exited with code ${code}`;
    if (workerReadyPromise) {
      workerReadyPromise.reject(new Error(reason));
      workerReadyPromise = null;
    }
    rejectPendingRecognitions(reason);
    workerProcess = null;
    workerStdoutBuffer = '';
    lastWorkerError = '';
  });
}

function getWorkerProcess() {
  if (workerProcess && !workerProcess.killed && workerReadyPromise === null) {
    return Promise.resolve(workerProcess);
  }

  if (workerReadyPromise) {
    return workerReadyPromise.promise;
  }

  let resolveReady;
  let rejectReady;
  const promise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  workerReadyPromise = {
    promise,
    resolve: resolveReady,
    reject: rejectReady,
  };

  createWorkerProcess();
  return promise;
}

router.get('/', async (req, res, next) => {
  try {
    const dateKey = req.query.date || new Date().toISOString().slice(0, 10);
    const records = await Attendance.find({ dateKey })
      .sort({ markedAt: -1 })
      .populate('student')
      .lean();

    res.json({ success: true, records });
  } catch (error) {
    next(error);
  }
});

router.post('/mark', async (req, res, next) => {
  try {
    const { faceLabel, confidence = 0, markedAt } = req.body;

    if (!faceLabel) {
      return res.status(400).json({
        success: false,
        message: 'faceLabel is required',
      });
    }

    const result = await markAttendanceForLabel(faceLabel, confidence, markedAt);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

router.post('/scan', async (req, res, next) => {
  try {
    const { image } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'image is required',
      });
    }

    const [, encoded] = image.split(',');
    if (!encoded) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image payload',
      });
    }

    let recognition;

    try {
      const imageBuffer = Buffer.from(encoded, 'base64');
      recognition = await runRecognition(imageBuffer);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          'Python recognition service unavailable. Pehle `npm run setup:python` aur `npm run py:train` complete karo.',
        details: error.message,
      });
    }

    if (!recognition.success) {
      return res.status(500).json({
        success: false,
        message: recognition.message || 'Recognition failed',
      });
    }

    if (!recognition.matched) {
      return res.json({
        success: true,
        recognized: false,
        message: recognition.message || 'Face not recognized',
        confidence: recognition.confidence || 0,
      });
    }

    const attendanceResult = await markAttendanceForLabel(recognition.label, recognition.confidence);

    return res.status(attendanceResult.status).json({
      ...attendanceResult.body,
      recognized: true,
      recognition: {
        label: recognition.label,
        confidence: recognition.confidence,
        box: recognition.box,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
