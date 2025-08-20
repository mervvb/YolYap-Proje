// Yükleniyor spinner bileşeni. Erişilebilir ve özelleştirilebilir.
interface LoaderProps {
  size?: number // Tailwind boyut (h/w-*) için
  color?: string // Tailwind renk (ör: gray-900, blue-600)
  fullScreen?: boolean // Tam ekran ortalama
}

export default function Loader({ size = 12, color = "gray-900", fullScreen = true }: LoaderProps) {
  return (
    <div
      className={`flex justify-center items-center ${fullScreen ? "h-screen" : ""}`}
      role="status"
    >
      <div
        className={`animate-spin rounded-full h-${size} w-${size} border-4 border-${color} border-t-transparent`}
      ></div>
      <span className="sr-only">Loading...</span>
    </div>
  )
}