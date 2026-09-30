/**
 * imageCompress — 图片压缩工具（纯视觉层）
 *
 * 用 canvas 将用户上传的图片等比缩小到目标尺寸并重新编码，
 * 优先输出 WebP（支持透明 + 体积更小），浏览器不支持时降级 PNG / JPEG。
 * 任何一步失败都回退为原始 dataUrl，绝不抛错、绝不中断上传。
 */

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}

/**
 * 压缩图片文件为 dataUrl。
 * @param {File|Blob} file
 * @param {{ maxSize?: number, quality?: number, withAlpha?: boolean }} options
 * @returns {Promise<string|null>}
 */
export async function compressImageFileToDataUrl(
  file,
  { maxSize = 1024, quality = 0.82, withAlpha = true } = {},
) {
  if (!file) return null
  const original = await readFileAsDataUrl(file)
  try {
    const img = await loadImage(original)
    const w0 = img.naturalWidth || img.width || 1
    const h0 = img.naturalHeight || img.height || 1
    const scale = Math.min(1, maxSize / Math.max(w0, h0))
    const w = Math.max(1, Math.round(w0 * scale))
    const h = Math.max(1, Math.round(h0 * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.drawImage(img, 0, 0, w, h)

    // 优先 WebP（含透明通道）；不支持时 toDataURL 会返回 PNG
    try {
      const webp = canvas.toDataURL('image/webp', quality)
      if (webp && webp.startsWith('data:image/webp')) return webp
    } catch { /* ignore */ }

    if (withAlpha) return canvas.toDataURL('image/png')
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return original
  }
}