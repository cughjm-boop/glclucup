export default function LoadingSpinner({ size = 'md', text = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 animate-fade-in">
      <div
        className={`${sizeClasses[size]} border-3 border-gray-200 border-t-ios-blue rounded-full animate-spin`}
        style={{ borderWidth: '3px' }}
      />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  )
}