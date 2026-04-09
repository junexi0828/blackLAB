import { Route, Routes } from 'react-router-dom'
import { ConsolePage } from './pages/ConsolePage'

function App() {
  return (
    <Routes>
      {/* The entire React app (mounted at /console) is the Metaverse world */}
      <Route path="*" element={<ConsolePage />} />
    </Routes>
  )
}

export default App
