import { Navigate, Route, Routes } from 'react-router-dom'
import { ConsolePage } from './pages/ConsolePage'

function App() {
  return (
    <Routes>
      {/* `/console` is the single React entry point. Other operator pages live on the server dashboard. */}
      <Route path="/" element={<ConsolePage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}

export default App
