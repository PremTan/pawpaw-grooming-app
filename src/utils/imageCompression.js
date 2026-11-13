export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const IMAGE_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

const MAX_SOURCE_SIZE_MB = 10
const MAX_OUTPUT_SIZE_MB = 0.5
const MAX_WIDTH_OR_HEIGHT = 1200
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

  const { size = 1000, quality = 0.82, outputType = file.type || 'image/jpeg' } = options
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

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
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
  const sourceWidth = Math.max(1, Math.round(croppedAreaPixels.width || 0))
  const sourceHeight = Math.max(1, Math.round(croppedAreaPixels.height || 0))

  // Direct single-pass hardware downscaling to max 1200px (fast, GPU accelerated)
  const maxDim = options.maxDimension || MAX_WIDTH_OR_HEIGHT
  let targetWidth = sourceWidth
  let targetHeight = sourceHeight
  if (targetWidth > maxDim || targetHeight > maxDim) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxDim) / targetWidth)
      targetWidth = maxDim
    } else {
      targetWidth = Math.round((targetWidth * maxDim) / targetHeight)
      targetHeight = maxDim
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Your browser does not support image cropping.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  const outputType = options.outputType || file.type || 'image/jpeg'
  const quality = options.quality ?? 0.82
  const extension = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg'
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, outputType, quality)
  })

  if (!blob) {
    throw new Error('Could not crop the selected image.')
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + `-cropped.${extension}`, {
    type: outputType,
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

  // If already small enough (<= 400 KB), upload directly
  if (file.size <= 400 * 1024) {
    return file
  }

  const { maxDimension = MAX_WIDTH_OR_HEIGHT, quality = 0.82 } = options

  try {
    // Fast native hardware-accelerated canvas resize (~50ms)
    const image = await readImageFile(file)
    const sourceWidth = image.naturalWidth || image.width || 1
    const sourceHeight = image.naturalHeight || image.height || 1

    let targetWidth = sourceWidth
    let targetHeight = sourceHeight
    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      if (targetWidth >= targetHeight) {
        targetHeight = Math.round((targetHeight * maxDimension) / targetWidth)
        targetWidth = maxDimension
      } else {
        targetWidth = Math.round((targetWidth * maxDimension) / targetHeight)
        targetHeight = maxDimension
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const context = canvas.getContext('2d')
    if (!context) {
      return file
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    // Convert heavy PNGs or large JPEGs to efficient JPEG for fast upload
    const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
    if (outputType === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, targetWidth, targetHeight)
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, outputType, quality)
    })

    if (!blob || blob.size >= file.size) {
      return file
    }

    const ext = outputType === 'image/webp' ? 'webp' : 'jpg'
    const baseName = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}-opt.${ext}`, {
      type: outputType,
      lastModified: Date.now(),
    })
  } catch (err) {
    console.warn('[optimizeImageForUpload] Fast canvas resize fallback:', err)
    return file
  }
}
