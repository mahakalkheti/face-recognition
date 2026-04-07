const mongoose = require('mongoose');
const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    faceLabel: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    rollNumber: {
      type: String,
      trim: true,
      default: '',
    },
    joiningDate: {
      type: Date,
      default: null,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Student', studentSchema);
