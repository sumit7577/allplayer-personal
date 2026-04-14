import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import PlayerPage from './pages/PlayerPage'
import AddVideoPage from './pages/AddVideoPage'
import LibraryPage from './pages/LibraryPage'

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/watch/:id" element={<PlayerPage />} />
        <Route path="/add" element={<AddVideoPage />} />
        <Route path="/library" element={<LibraryPage />} />
      </Routes>
    </div>
  )
}
