async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const rawBody = await response.text();
  const payload = contentType.includes('application/json')
    ? JSON.parse(rawBody || '{}')
    : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        `Request failed with status ${response.status}. Server returned ${contentType || 'an unexpected response'}.`
    );
  }

  if (!payload) {
    throw new Error(
      `Expected JSON response from ${url}, but received ${contentType || 'non-JSON content'}.`
    );
  }

  return payload;
}

function createCell(value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  return cell;
}

function renderStudents(students) {
  const tableBody = document.getElementById('students-table-body');
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!students.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No teachers added yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  students.slice(0, 8).forEach((student) => {
    const row = document.createElement('tr');
    row.appendChild(createCell(student.name));

    const labelCell = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = student.faceLabel;
    labelCell.appendChild(code);
    row.appendChild(labelCell);

    row.appendChild(createCell(student.joiningDate ? new Date(student.joiningDate).toLocaleDateString() : '-'));
    row.appendChild(createCell(student.department || '-'));
    tableBody.appendChild(row);
  });
}

function renderAttendance(records, elementId, columnCount) {
  const tableBody = document.getElementById(elementId);
  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = '';

  if (!records.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columnCount;
    cell.textContent = 'No attendance marked yet.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  records.forEach((record) => {
    const row = document.createElement('tr');
    row.appendChild(createCell(record.student?.name || record.faceLabel));

    if (columnCount === 4) {
      const labelCell = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = record.faceLabel;
      labelCell.appendChild(code);
      row.appendChild(labelCell);
    }

    row.appendChild(createCell(new Date(record.markedAt).toLocaleString()));
    row.appendChild(createCell(Number(record.confidence || 0).toFixed(3)));
    tableBody.appendChild(row);
  });
}

async function refreshHomeData() {
  const [studentsData, attendanceData] = await Promise.all([
    fetchJson('/api/students'),
    fetchJson('/api/attendance'),
  ]);

  renderStudents(studentsData.students || []);
  renderAttendance(attendanceData.records || [], 'attendance-table-body', 3);
}

let cameraStream = null;
let scanInterval = null;
let scanInFlight = false;
let enrollmentCameraStream = null;
let enrollmentImages = [];

function setScanStatus(message) {
  const scanStatus = document.getElementById('camera-status');
  if (scanStatus) {
    scanStatus.textContent = message;
  }
}

function setRecognitionResult(message, isSuccess = false) {
  const result = document.getElementById('recognition-result');
  if (result) {
    result.textContent = message;
    result.classList.toggle('status-success', isSuccess);
  }
}

function setScanLoading(isLoading) {
  const startButton = document.getElementById('start-camera');
  const scanButton = document.getElementById('scan-now');
  const loader = document.getElementById('camera-loader');

  if (startButton) {
    startButton.disabled = isLoading;
  }

  if (scanButton) {
    scanButton.disabled = isLoading;
  }

  if (loader) {
    loader.textContent = isLoading ? 'Attendance scan process ho raha hai...' : '';
  }
}

async function scanCurrentFrame() {
  if (scanInFlight) {
    return;
  }

  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('camera-canvas');

  if (!video || !canvas || video.readyState < 2) {
    return;
  }

  scanInFlight = true;
  setScanLoading(true);
  setScanStatus('Scanning live frame...');

  try {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const payload = {
      image: canvas.toDataURL('image/jpeg', 0.9),
    };

    const response = await fetchJson('/api/attendance/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.recognized) {
      const studentName = response.record?.student?.name || response.recognition?.label || 'Teacher';
      const confidence = Number(response.recognition?.confidence || response.record?.confidence || 0).toFixed(3);
      const suffix = response.duplicate ? 'already marked today.' : 'attendance marked.';
      const success = !response.duplicate;
      setRecognitionResult(`${studentName} recognized at ${confidence}. ${suffix}`, success);
      await refreshHomeData();
    } else {
      const confidence = Number(response.confidence || 0).toFixed(3);
      setRecognitionResult(`${response.message || 'Face not recognized'} (${confidence})`, false);
    }
  } catch (error) {
      setRecognitionResult(error.message, false);
    } finally {
      setScanLoading(false);
      setScanStatus(cameraStream ? 'Camera is live. Auto scan running every 3 seconds.' : 'Camera stopped.');
      scanInFlight = false;
    }
}

async function startLiveCamera() {
  const video = document.getElementById('camera-feed');
  if (!video) {
    return;
  }

  if (cameraStream) {
    setScanStatus('Camera already running.');
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
      },
      audio: false,
    });

    video.srcObject = cameraStream;
    await video.play();

    setScanStatus('Camera is live. Auto scan running every 3 seconds.');
    setRecognitionResult('Live recognition ready. Face ko camera ke saamne rakho.');

    scanInterval = window.setInterval(scanCurrentFrame, 3000);
    window.setTimeout(scanCurrentFrame, 1200);
  } catch (error) {
    cameraStream = null;
    setScanStatus('Camera access blocked.');
    setRecognitionResult(`Camera open nahi hua: ${error.message}`);
  }
}

function stopLiveCamera() {
  const video = document.getElementById('camera-feed');

  if (scanInterval) {
    window.clearInterval(scanInterval);
    scanInterval = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  setScanStatus('Camera stopped.');
}

function setEnrollmentCameraStatus(message) {
  const status = document.getElementById('enrollment-camera-status');
  if (status) {
    status.textContent = message;
  }
}

function setEnrollmentSampleStatus(message) {
  const status = document.getElementById('enrollment-sample-status');
  if (status) {
    status.textContent = message;
  }
}

function renderEnrollmentPreview() {
  const preview = document.getElementById('enrollment-preview');
  if (!preview) {
    return;
  }

  preview.innerHTML = '';

  enrollmentImages.forEach((image, index) => {
    const img = document.createElement('img');
    img.src = image;
    img.alt = `Enrollment sample ${index + 1}`;
    preview.appendChild(img);
  });
}

async function startEnrollmentCamera() {
  const video = document.getElementById('enrollment-camera-feed');
  if (!video) {
    return;
  }

  if (enrollmentCameraStream) {
    setEnrollmentCameraStatus('Enrollment camera already running.');
    return;
  }

  try {
    enrollmentCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
      },
      audio: false,
    });

    video.srcObject = enrollmentCameraStream;
    await video.play();
    setEnrollmentCameraStatus('Enrollment camera live hai. Face center me rakho aur samples capture karo.');
  } catch (error) {
    enrollmentCameraStream = null;
    setEnrollmentCameraStatus(`Camera open nahi hua: ${error.message}`);
  }
}

function stopEnrollmentCamera() {
  const video = document.getElementById('enrollment-camera-feed');

  if (enrollmentCameraStream) {
    enrollmentCameraStream.getTracks().forEach((track) => track.stop());
    enrollmentCameraStream = null;
  }

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  setEnrollmentCameraStatus('Enrollment camera stopped.');
}

async function captureEnrollmentSamples() {
  const video = document.getElementById('enrollment-camera-feed');
  const canvas = document.getElementById('enrollment-camera-canvas');

  if (!video || !canvas || video.readyState < 2) {
    setEnrollmentSampleStatus('Pehle enrollment camera start karo.');
    return;
  }

  enrollmentImages = [];
  renderEnrollmentPreview();
  setEnrollmentSampleStatus('Capturing 12 face samples...');

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const context = canvas.getContext('2d');

  for (let index = 0; index < 12; index += 1) {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    enrollmentImages.push(canvas.toDataURL('image/jpeg', 0.9));
    renderEnrollmentPreview();
    setEnrollmentSampleStatus(`Captured ${index + 1}/12 face samples`);
    // Small delay so samples are not identical
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => window.setTimeout(resolve, 220));
  }

  setEnrollmentSampleStatus('Face samples ready. Ab student save karo.');
}

async function refreshAttendancePage() {
  const status = document.getElementById('attendance-page-status');
  if (status) {
    status.textContent = 'Refreshing records...';
  }

  try {
    const attendanceData = await fetchJson('/api/attendance');
    renderAttendance(attendanceData.records || [], 'attendance-page-body', 4);

    if (status) {
      status.textContent = `Showing ${attendanceData.records.length} record(s) for today.`;
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message;
    }
  }
}

const studentForm = document.getElementById('student-form');
if (studentForm) {
  studentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formStatus = document.getElementById('student-form-status');
    const submitButton = studentForm.querySelector('button[type="submit"]');
    const formData = new FormData(studentForm);
    const payload = Object.fromEntries(formData.entries());
    payload.enrollmentImages = enrollmentImages;

    if (enrollmentImages.length < 6) {
      if (formStatus) {
        formStatus.textContent = 'Pehle kam se kam 6 face samples capture karo.';
      }
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    if (formStatus) {
      formStatus.textContent = 'Teacher registration process ho raha hai. Thoda ruko...';
    }

    try {
      await fetchJson('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (formStatus) {
        formStatus.textContent = 'Teacher save ho gaya, model train ho gaya, ab attendance page khol kar check karo.';
      }

      studentForm.reset();
      enrollmentImages = [];
      renderEnrollmentPreview();
      setEnrollmentSampleStatus('Required samples: 6 minimum. Recommended: 12.');
      await refreshHomeData();
    } catch (error) {
      if (formStatus) {
        formStatus.textContent = error.message;
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });

  refreshHomeData().catch((error) => {
    const formStatus = document.getElementById('student-form-status');
    if (formStatus) {
      formStatus.textContent = error.message;
    }
  });
}

const refreshAttendanceButton = document.getElementById('refresh-attendance');
if (refreshAttendanceButton) {
  refreshAttendanceButton.addEventListener('click', refreshAttendancePage);
  refreshAttendancePage();
}

const startCameraButton = document.getElementById('start-camera');
const stopCameraButton = document.getElementById('stop-camera');
const scanNowButton = document.getElementById('scan-now');

if (startCameraButton) {
  startCameraButton.addEventListener('click', startLiveCamera);
}

if (stopCameraButton) {
  stopCameraButton.addEventListener('click', stopLiveCamera);
}

if (scanNowButton) {
  scanNowButton.addEventListener('click', scanCurrentFrame);
}

const startEnrollmentCameraButton = document.getElementById('start-enrollment-camera');
const stopEnrollmentCameraButton = document.getElementById('stop-enrollment-camera');
const captureEnrollmentButton = document.getElementById('capture-enrollment');

if (startEnrollmentCameraButton) {
  startEnrollmentCameraButton.addEventListener('click', startEnrollmentCamera);
}

if (stopEnrollmentCameraButton) {
  stopEnrollmentCameraButton.addEventListener('click', stopEnrollmentCamera);
}

if (captureEnrollmentButton) {
  captureEnrollmentButton.addEventListener('click', captureEnrollmentSamples);
}

window.addEventListener('beforeunload', () => {
  stopLiveCamera();
  stopEnrollmentCamera();
});
