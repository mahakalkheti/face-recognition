const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const Student = require('../models/Student');

const router = express.Router();
const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_VENV_PYTHON = path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe');
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || DEFAULT_VENV_PYTHON;
const DATASET_ROOT = path.join(PROJECT_ROOT, 'python', 'data', 'dataset');
const TRAIN_SCRIPT = path.join(PROJECT_ROOT, 'python', 'train_model.py');

async function saveEnrollmentImages(faceLabel, images) {
  const labelDir = path.join(DATASET_ROOT, faceLabel);
  await fs.rm(labelDir, { recursive: true, force: true });
  await fs.mkdir(labelDir, { recursive: true });

  await Promise.all(
    images.map(async (image, index) => {
      const [, encoded] = String(image).split(',');
      if (!encoded) {
        throw new Error(`Invalid image payload at index ${index}`);
      }

      const fileName = `${String(index).padStart(3, '0')}.jpg`;
      const filePath = path.join(labelDir, fileName);
      await fs.writeFile(filePath, Buffer.from(encoded, 'base64'));
    })
  );
}

async function trainEmbeddings() {
  await execFileAsync(PYTHON_EXECUTABLE, [TRAIN_SCRIPT], {
    cwd: PROJECT_ROOT,
    timeout: 300000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      TF_CPP_MIN_LOG_LEVEL: '2',
    },
  });
}

router.get('/', async (req, res, next) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, students });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, faceLabel, rollNumber, joiningDate, department, email, enrollmentImages = [] } = req.body;

    if (!name || !faceLabel || !joiningDate) {
      return res.status(400).json({
        success: false,
        message: 'name and faceLabel are required',
      });
    }

    if (!Array.isArray(enrollmentImages) || enrollmentImages.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'At least 6 face scan images are required',
      });
    }

    const student = await Student.create({
      name,
      faceLabel,
      rollNumber,
      joiningDate,
      department,
      email,
    });

    try {
      await saveEnrollmentImages(faceLabel, enrollmentImages);
      await trainEmbeddings();
    } catch (error) {
      await Student.findByIdAndDelete(student._id);
      await fs.rm(path.join(DATASET_ROOT, faceLabel), { recursive: true, force: true });

      return res.status(500).json({
        success: false,
        message:
          'Student save hua nahi because face model train nahi ho paya. Python setup aur camera images check karo.',
        details: error.message,
      });
    }

    res.status(201).json({ success: true, student });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'faceLabel already exists',
      });
    }

    next(error);
  }
});

module.exports = router;
