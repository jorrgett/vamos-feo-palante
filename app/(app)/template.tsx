// Cada pantalla aparece con un fundido suave al navegar (solo opacidad: no mueve las barras fijas).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="pagina">{children}</div>;
}
