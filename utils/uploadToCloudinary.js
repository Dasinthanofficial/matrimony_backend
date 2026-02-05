import fs from 'fs';
import path from 'path';
import cloudinary, { hasCloudinary } from '../config/cloudinary.js';

const uploadToCloudinary = async (filePath, folder = 'matrimony') => {
  // fallback to local
  if (!hasCloudinary) {
    return { url: `/uploads/${path.basename(filePath)}`, publicId: null };
  }

  const result = await cloudinary.uploader.upload(filePath, { folder });
  try { fs.unlinkSync(filePath); } catch {}
  return { url: result.secure_url, publicId: result.public_id };
};

export default uploadToCloudinary;