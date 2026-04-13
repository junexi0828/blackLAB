import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

const LazyConsolePage = lazy(async () => {
  const module = await import('./pages/ConsolePage')
  return { default: module.ConsolePage }
})

function App() {
  return (
    <Suspense
      fallback={
        <div className="console-app-loading">
          <div className="console-app-loading__card">
            <div className="console-app-loading__ring" />
            <div className="console-app-loading__copy">
              <strong>blackLAB</strong>
              <p>Loading console shell</p>
            </div>
          </div>
        </div>
      }
    >
      <Routes>
        {/* The entire React app (mounted at /console) is the Metaverse world */}
        <Route path="*" element={<LazyConsolePage />} />
      </Routes>
    </Suspense>
  )
}

export default App
