const mongoose = require('mongoose');
const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    faceLabel: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      default: 0,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    dateKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: 'Present',
    },
  },
  {
    timestamps: true,
  }
);

attendanceSchema.index({ student: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
