import React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

function App() {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f7f6f2] px-6 text-[#20201e]">
      <h1 className="text-[clamp(6rem,22vw,20rem)] font-bold leading-none tracking-[-0.075em]">hello</h1>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
