export default function ConfirmDialog({ title, message, onConfirm, onCancel, confirmText = '确认', danger = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="ios-card p-6 mx-4 max-w-sm w-full animate-bounce-in">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 ios-button-secondary">
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 ${danger ? 'ios-button-danger' : 'ios-button'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}