import Island from './components/Island'
import { AppProvider } from './state'

export default function App() {
  return (
    <AppProvider>
      <Island />
    </AppProvider>
  )
}
