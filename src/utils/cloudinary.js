import { formatImageSize, optimizeImageForUpload, shouldOptimizeImage } from './imageCompression'

function logImageUpload(originalFile, uploadFile, optimized) {
  const savedBytes = Math.max(originalFile.size - uploadFile.size, 0)
  const savedPercent = originalFile.size ? Math.round((savedBytes / originalFile.size) * 100) : 0

  console.info('[Image upload]', {
    fileName: originalFile.name,
    type: uploadFile.type || originalFile.type,
    optimized,
    originalSize: formatImageSize(originalFile.size),
    uploadSize: formatImageSize(uploadFile.size),
    saved: formatImageSize(savedBytes),
    savedPercent: `${savedPercent}%`,
  })
}

export async function uploadToCloudinary(file, options = {}) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const { onOptimizeStart, onOptimizeProgress, onOptimizeEnd } = options

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env')
  }

  const willOptimize = shouldOptimizeImage(file)
  let uploadFile
  try {
    if (willOptimize) onOptimizeStart?.()
    uploadFile = await optimizeImageForUpload(file, { onProgress: onOptimizeProgress })
  } finally {
    if (willOptimize) onOptimizeEnd?.()
  }

  logImageUpload(file, uploadFile, willOptimize)

  const data = new FormData()
  data.append('file', uploadFile)
  data.append('upload_preset', uploadPreset)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: data,
  })
  const json = await res.json()

  if (json.error) throw new Error(json.error.message)
  return json.secure_url
}
