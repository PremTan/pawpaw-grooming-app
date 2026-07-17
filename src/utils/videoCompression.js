const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const MAX_VIDEO_DURATION = 30
const MAX_VIDEO_SOURCE_SIZE_MB = 200
const MAX_VIDEO_SOURCE_BYTES = MAX_VIDEO_SOURCE_SIZE_MB * 1024 * 1024

export const VIDEO_FILE_ACCEPT = '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm'

export function isSupportedVideo(file) {
  return !!file && ACCEPTED_VIDEO_TYPES.includes(file.type)
}

export function validateVideoFile(file) {
  if (!file) {
    throw new Error('Please choose a video to upload.')
  }

  if (!isSupportedVideo(file)) {
    throw new Error('Please upload an MP4, MOV, or WEBM video.')
  }

  if (file.size > MAX_VIDEO_SOURCE_BYTES) {
    throw new Error(`Video must be ${MAX_VIDEO_DURATION} seconds or shorter and less than ${MAX_VIDEO_SOURCE_SIZE_MB} MB.`)
  }
}

export function formatVideoDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function getVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read video file metadata.'))
    }
    video.src = url
  })
}

