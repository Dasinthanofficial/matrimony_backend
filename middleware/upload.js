import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const finalName = `${Date.now()}-${uniqueSuffix}${ext}`;
    cb(null, finalName);
  },
});

// Only allow image/ mimetype
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Create and export Multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    // 10 MB max
    fileSize: 10 * 1024 * 1024,
  },
});

export default upload;