import { PhoneApp } from './phone/PhoneApp'
import { TvApp } from './tv/TvApp'
import './App.css'

/** `/tv` (and anything under it) is the shared screen; everything else is a phone. */
export default function App() {
  return location.pathname.startsWith('/tv') ? <TvApp /> : <PhoneApp />
}
