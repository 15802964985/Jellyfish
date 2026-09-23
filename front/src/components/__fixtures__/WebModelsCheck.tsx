import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import WebModels from '../../pages/WebModels'
/** Render the production settings component with an isolated router for offline browser verification. */
function Fixture(){return <ConfigProvider locale={zhCN}><MemoryRouter><WebModels/></MemoryRouter></ConfigProvider>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
