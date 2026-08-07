import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'

/**
 * 生成圆形头像（双重遮罩法，100% 确保 PNG 透明通道）
 * - 先绘制整张裁剪后的图片（无 clip）
 * - 再用 globalCompositeOperation='destination-in' 叠加圆形 Alpha 遮罩
 * - 圆形外所有像素的 Alpha 通道强制为 0，得到干净的透明背景
 * @param {string} imageSrc - 图片源
 * @param {Object} pixelCrop - { x, y, width, height }
 * @returns {Promise<string>} base64 圆形 PNG（带完全透明通道）
 */
function createCircularAvatar(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const size = 512 // 输出尺寸（正方形画布）
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      // ========== 第一步：清空画布为透明 ==========
      ctx.clearRect(0, 0, size, size)

      // ========== 第二步：绘制裁剪后的图片（整个方形区域）==========
      ctx.save()
      ctx.drawImage(
        img,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        size,
        size
      )
      ctx.restore()

      // ========== 第三步：globalCompositeOperation + 圆形遮罩 ==========
      // destination-in：保留"源（圆形遮罩）与目标（已绘制的图片）相交的区域"
      // 即：圆形内保留图片，圆形外 Alpha 强制为 0（透明）
      ctx.save()
      ctx.globalCompositeOperation = 'destination-in'
      ctx.beginPath()
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.fillStyle = '#000000' // 颜色不重要，Alpha 通道决定保留区域
      ctx.fill()
      ctx.restore()

      // ========== 第四步：output 为 image/png 确保透明通道输出 ==========
      const dataUrl = canvas.toDataURL('image/png')
      resolve(dataUrl)
    }
    img.onerror = reject
    img.src = imageSrc
  })
}

export default function AvatarCropper({ imageSrc, onComplete, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)
  const imgRef = useRef(null)

  const onCropComplete = useCallback((_, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return
    setIsProcessing(true)
    setError(null)
    try {
      const circularAvatar = await createCircularAvatar(imageSrc, croppedAreaPixels)
      onComplete(circularAvatar)
    } catch (err) {
      setError('裁剪失败，请重试')
      console.error('Avatar crop error:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [imageSrc, croppedAreaPixels, onComplete])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 animate-fade-in">
      {/* 顶部操作栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 pt-safe bg-black/60 backdrop-blur-xl">
        <button
          onClick={onCancel}
          className="text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-white/10 transition-colors"
        >
          取消
        </button>
        <h3 className="text-white text-base font-semibold">裁剪头像</h3>
        <button
          onClick={handleConfirm}
          disabled={isProcessing || !croppedAreaPixels}
          className="text-ios-blue text-sm font-semibold px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isProcessing ? '处理中...' : '确认'}
        </button>
      </div>

      {/* 裁剪区域 */}
      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
          objectFit="contain"
          cropSize={undefined}
          style={{
            containerStyle: { backgroundColor: '#000' },
            cropAreaStyle: {
              border: '2px solid rgba(255,255,255,0.8)',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            },
          }}
        />
      </div>

      {/* 底部控制栏 */}
      <div className="flex-shrink-0 bg-black/60 backdrop-blur-xl px-4 py-4 pb-safe">
        <div className="flex items-center gap-4 max-w-md mx-auto">
          <svg className="w-4 h-4 text-white/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-1 bg-white/30 rounded-full appearance-none cursor-pointer accent-ios-blue"
            style={{
              WebkitAppearance: 'none',
              appearance: 'none',
            }}
          />
          <svg className="w-5 h-5 text-white/60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </div>
        <p className="text-center text-xs text-white/40 mt-3">
          拖动图片调整位置 · 双指缩放或滑动滑块调整大小
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-red-500/90 text-white text-sm">
          {error}
        </div>
      )}
    </div>
  )
}