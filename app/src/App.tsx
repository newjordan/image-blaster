import { Suspense, lazy } from 'react'
import { useRoute, useLocation, Redirect } from 'wouter'
import { WorldViewer } from './components/WorldViewer'
import { WorldSidebar } from './components/WorldSidebar'
import { BottomLeftControls } from './components/BottomLeftControls'
import { TouchControls } from './components/TouchControls'
import { useSceneProject } from './modules/scene/useSceneProject'
import { loadWorlds } from './utils/worldLoader'
import { useDebugStore } from './store/debug'

const worlds = loadWorlds()
const LevaPanel = import.meta.env.DEV
  ? lazy(() => import('leva').then((module) => ({ default: module.Leva })))
  : null
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DebugPanel').then((module) => ({ default: module.DebugPanel })))
  : null

export function App() {
  const [editMatch, editParams] = useRoute('/:slug/edit')
  const [match, params] = useRoute('/:slug')
  const levaCollapsed = useDebugStore((s) => s.levaCollapsed)
  const setLevaCollapsed = useDebugStore((s) => s.setLevaCollapsed)
  const [location] = useLocation()

  if (!worlds.length) {
    return (
      <div className="flex items-center justify-center h-screen text-white bg-black">
        No worlds found in worlds/
      </div>
    )
  }

  const slug = editParams?.slug ?? params?.slug ?? worlds[0].slug
  const entry = worlds.find((w) => w.slug === slug) ?? worlds[0]
  const editing = Boolean(editMatch)
  const showLeva = import.meta.env.DEV && import.meta.env.VITE_SHOW_LEVA === 'true'
  const { sceneProject, sceneProjectReady, updateSceneProject } = useSceneProject(entry.slug, location, entry.sceneProject)

  if (!editMatch && !match) {
    return <Redirect to={`/${worlds[0].slug}`} />
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none [&_*]:focus:ring-0 [&_*]:focus-visible:ring-0">
      {!editing && LevaPanel && DebugPanel && showLeva && (
        <div className="hidden md:block">
          <Suspense fallback={null}>
            <LevaPanel
              collapsed={{ collapsed: levaCollapsed, onChange: setLevaCollapsed }}
              theme={{ sizes: { rootWidth: '380px', controlWidth: '180px' } }}
            />
            <DebugPanel />
          </Suspense>
        </div>
      )}
      <WorldViewer
        world={entry.world}
        slug={entry.slug}
        objectAssets={entry.objectAssets}
        allObjectAssets={entry.allObjectAssets}
        worldSfxUrls={entry.worldSfxUrls}
        sceneProject={sceneProject}
        sceneProjectReady={sceneProjectReady}
        editing={editing}
        onSceneProjectSaved={updateSceneProject}
      />
      {!editing && (
        <>
          <div className="fixed inset-x-4 top-4 z-10 sm:left-4 sm:right-auto">
            <WorldSidebar worlds={worlds} activeSlug={entry.slug} activeSceneProject={sceneProject} />
          </div>
          <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4 sm:left-4 sm:right-auto sm:justify-start sm:px-0">
            <BottomLeftControls />
          </div>
          <TouchControls />
        </>
      )}
    </div>
  )
}
