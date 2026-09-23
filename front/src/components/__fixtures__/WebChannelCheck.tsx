import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Button } from 'antd'
import { WebHandoffButton } from '../WebHandoffButton'
import { GenerationChannelActions } from '../GenerationChannelActions'
/** Offline browser fixture only; not imported by the production application. */
function Fixture(){return <MemoryRouter><GenerationChannelActions apiAction={<Button>API fixture</Button>} webAction={<WebHandoffButton prepare={async()=>location.search.includes('video')?({target_type:'lab_video',entity_id:'fixture-video',expected_version:1,prompt:'fixture video',reference_file_ids:[],reference_mode:'text',duration_seconds:4,aspect_ratio:'1:1'}):({target_type:'frame',entity_id:'fixture-shot',slot_id:7,expected_version:3,prompt:'fixture prompt',reference_file_ids:[]})}/>}/></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
