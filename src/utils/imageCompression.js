import imageCompression from 'browser-image-compression'

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const IMAGE_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

const MAX_SOURCE_SIZE_MB = 10
const MAX_OUTPUT_SIZE_MB = 1
const MAX_WIDTH_OR_HEIGHT = 1920
const BYTES_PER_MB = 1024 * 1024

export function formatImageSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`
  return `${Math.max(bytes / 1024, 1).toFixed(1)} KB`
}

export function isSupportedImage(file) {
  return !!file && ACCEPTED_IMAGE_TYPES.includes(file.type)
}

export function shouldOptimizeImage(file) {
  return !!file && file.size > MAX_OUTPUT_SIZE_MB * BYTES_PER_MB
}

export function validateImageFile(file) {
  if (!file) {
    throw new Error('Please choose an image to upload.')
  }

  if (!isSupportedImage(file)) {
    throw new Error('Please upload a JPG, PNG, or WEBP image.')
  }

  if (file.size > MAX_SOURCE_SIZE_MB * BYTES_PER_MB) {
    throw new Error(`Image must be ${MAX_SOURCE_SIZE_MB} MB or smaller.`)
  }
}

export async function optimizeImageForUpload(file, options = {}) {
  validateImageFile(file)

  if (file.size <= MAX_OUTPUT_SIZE_MB * BYTES_PER_MB) {
    return file
  }

  const { onProgress } = options

  try {
    const optimizedFile = await imageCompression(file, {
      maxSizeMB: MAX_OUTPUT_SIZE_MB,
      maxWidthOrHeight: MAX_WIDTH_OR_HEIGHT,
      initialQuality: 0.92,
      maxIteration: 12,
      preserveExif: true,
      useWebWorker: true,
      fileType: file.type,
      onProgress,
    })

    if (optimizedFile.size > MAX_OUTPUT_SIZE_MB * BYTES_PER_MB) {
      throw new Error('Could not optimize image below 1 MB without reducing quality too much.')
    }

    return optimizedFile
  } catch (err) {
    throw new Error(err.message || 'Could not optimize image. Please try another image.')
  }
}
