export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 animate-fade-in">
      {icon && <div className="text-6xl mb-4">{icon}</div>}
      {title && <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">{title}</h3>}
      {description && <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}