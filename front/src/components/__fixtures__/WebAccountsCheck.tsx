import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import WebAccounts from '../../pages/WebAccounts'
// Render the actual account page for read-only cross-page status verification.
createRoot(document.getElementById('root')!).render(<BrowserRouter><WebAccounts /></BrowserRouter>)
