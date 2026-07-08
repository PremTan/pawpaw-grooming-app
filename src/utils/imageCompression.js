import imageCompression from 'browser-image-compression'

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const IMAGE_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

const MAX_SOURCE_SIZE_MB = 10
const MAX_OUTPUT_SIZE_MB = 1
const MAX_WIDTH_OR_HEIGHT = 1920
const BYTES_PER_MB = 1024 * 1024

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image file.'))
    }
    image.src = url
  })
}

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

export async function cropImageToSquare(file, options = {}) {
  validateImageFile(file)

  const { size = 1400, quality = 0.92, outputType = file.type || 'image/jpeg' } = options
  const image = await readImageFile(file)
  const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)
  const sx = ((image.naturalWidth || image.width) - side) / 2
  const sy = ((image.naturalHeight || image.height) - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Your browser does not support image cropping.')
  }

  context.drawImage(image, sx, sy, side, side, 0, 0, size, size)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(resolve, outputType, quality)
  })

  if (!blob) {
    throw new Error('Could not process the selected image.')
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-square.jpg', {
    type: outputType,
    lastModified: Date.now(),
  })
}

export async function cropImageFile(file, croppedAreaPixels, options = {}) {
  validateImageFile(file)

  const image = await readImageFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = croppedAreaPixels.width
  canvas.height = croppedAreaPixels.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Your browser does not support image cropping.')
  }

  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
  )

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(resolve, file.type || 'image/jpeg', 0.95)
  })

  if (!blob) {
    throw new Error('Could not crop the selected image.')
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-cropped.jpg', {
    type: file.type || 'image/jpeg',
    lastModified: Date.now(),
  })
}

export async function compressAndCropImage(file, options = {}) {
  const { cropToSquare = true, ...rest } = options
  const croppedFile = cropToSquare ? await cropImageToSquare(file, rest) : file
  return optimizeImageForUpload(croppedFile, rest)
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
