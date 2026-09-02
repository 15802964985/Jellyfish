export type ProjectDataResource =
  | 'project'
  | 'chapters'
  | 'characters'
  | 'actors'
  | 'scenes'
  | 'props'
  | 'costumes'
  | 'files'

type ProjectDataChangedDetail = {
  projectId: string
  resources: ProjectDataResource[]
}

const EVENT_NAME = 'jellyfish:project-data-changed'

export function notifyProjectDataChanged(detail: ProjectDataChangedDetail) {
  window.dispatchEvent(new CustomEvent<ProjectDataChangedDetail>(EVENT_NAME, { detail }))
}

export function subscribeProjectDataChanged(
  handler: (detail: ProjectDataChangedDetail) => void,
) {
  const listener = (event: Event) => {
    handler((event as CustomEvent<ProjectDataChangedDetail>).detail)
  }
  window.addEventListener(EVENT_NAME, listener)
  return () => window.removeEventListener(EVENT_NAME, listener)
}
