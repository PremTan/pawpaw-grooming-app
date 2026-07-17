import { formatImageSize, optimizeImageForUpload, shouldOptimizeImage } from './imageCompression'

function logUpload(originalFile, uploadFile, optimized, resourceType) {
  const savedBytes = Math.max(originalFile.size - uploadFile.size, 0)
  const savedPercent = originalFile.size ? Math.round((savedBytes / originalFile.size) * 100) : 0

  console.info('[Cloudinary upload]', {
    resourceType,
    fileName: originalFile.name,
    originalType: originalFile.type,
    uploadType: uploadFile.type || originalFile.type,
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
  const { onOptimizeStart, onOptimizeProgress, onOptimizeEnd, resourceType = 'image', returnJson = false } = options

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to .env')
  }

  let uploadFile = file
  let optimized = false

  if (resourceType === 'image' && shouldOptimizeImage(file)) {
    try {
      onOptimizeStart?.()
      uploadFile = await optimizeImageForUpload(file, { onProgress: onOptimizeProgress })
      optimized = true
    } finally {
      onOptimizeEnd?.()
    }
  }

  logUpload(file, uploadFile, optimized, resourceType)

  const data = new FormData()
  data.append('file', uploadFile)
  data.append('upload_preset', uploadPreset)
  if (resourceType === 'video') {
    data.append('resource_type', 'video')
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`
  const res = await fetch(url, {
    method: 'POST',
    body: data,
  })
  const json = await res.json()

  if (json.error) throw new Error(json.error.message)
  return returnJson ? json : json.secure_url
}
