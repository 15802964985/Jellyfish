import { WebHandoffButton, type HandoffImageTarget } from './WebHandoffButton'
/** All image entry points share platform/model/account selection and the immutable request flow. */
export function WebImageButton(props:{prepare:()=>Promise<HandoffImageTarget>;onAccepted?:(taskId:string)=>void;disabled?:boolean}) {
 return <WebHandoffButton {...props}/>
}
