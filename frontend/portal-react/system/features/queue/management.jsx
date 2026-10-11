import React from 'react'
import css from './management.css?inline'

function Icon({name}) {
 const paths = {
  back:<path d="m10 5-7 7 7 7M3 12h18"/>,
  video:<><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 9 4-3v12l-4-3"/></>,
  upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></>,
  refresh:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/></>
 }
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

// Mounted once. The companion controller owns uploads, playlist rows and preview.
export default function Page() {
 return <>
  <style>{css}</style>
  <header className="app-header-bar site-header queue-site-header">
   <div className="brand">
    <img className="brand-mark" src="assets/laoag-city-official-seal.png" alt="Laoag City official seal"/>
    <div><h1>Office of the City Engineer</h1><p className="brand-subtitle">City Government of Laoag</p></div>
   </div>
   <div id="playlistStaff" className="station-chip">Staff workspace</div>
  </header>
  <main className="management-container playlist-container">
   <nav className="playlist-nav" aria-label="Queue management pages">
    <a className="playlist-button" href="workstations.html"><Icon name="back"/>Back to station</a>
    <div><a className="playlist-button" href="monitor.html">Monitor display</a><a id="playlistAuditLink" className="playlist-button" href="audit-logs.html" hidden>Audit logs</a></div>
   </nav>
   <section className="playlist-heading" aria-labelledby="playlistTitle">
    <div><p className="playlist-kicker">Display content</p><h2 id="playlistTitle">Video playlist</h2><p>Choose which videos play on the queue monitor and arrange their order.</p></div>
    <button id="playlistRefresh" className="playlist-button" type="button"><Icon name="refresh"/>Refresh</button>
   </section>
   <div id="playlistFeedback" className="playlist-feedback" role="status" aria-live="polite" hidden/>
   <div className="playlist-workspace">
    <section className="playlist-panel playlist-upload" aria-labelledby="uploadTitle">
     <div className="playlist-panel-heading"><span className="playlist-section-icon"><Icon name="upload"/></span><div><h3 id="uploadTitle">Upload a video</h3><p>New uploads are added to the end.</p></div></div>
     <form id="videoUploadForm">
      <div id="dropzone" className="dropzone-wrapper">
       <Icon name="video"/><h4>Drop a video here</h4><p>or choose a file from this computer</p>
       <button id="playlistBrowse" className="playlist-button" type="button">Browse files</button>
       <input type="file" id="fileInput" className="native-file-input" accept=".mp4,.webm,.mov,.m4v" aria-label="Choose a monitor video"/>
      </div>
      <div id="fileSelectedFeedback" className="playlist-file" hidden>Selected: <span id="fileNameSpan"/></div>
      <p className="playlist-upload-note">MP4, WebM, MOV or M4V · Maximum 100 MB. MP4 is recommended for playback.</p>
      <button id="playlistUpload" className="playlist-button playlist-primary" type="submit"><Icon name="upload"/><span>Upload video</span></button>
     </form>
    </section>
    <section className="playlist-panel playlist-clips" aria-labelledby="playlistClipsTitle">
     <div className="playlist-panel-heading"><div><h3 id="playlistClipsTitle">Monitor videos</h3><p id="playlistCount" aria-live="polite">Loading playlist…</p></div></div>
     <p className="playlist-order-note">Videos play from top to bottom. Disabled videos stay here until you enable them again.</p>
     <ol id="playlistRows" className="playlist-rows" aria-busy="true"><li className="playlist-empty">Loading videos…</li></ol>
    </section>
   </div>
  </main>
  <dialog id="playlistPreview" className="playlist-preview" aria-labelledby="playlistPreviewTitle">
   <div className="playlist-preview-heading"><div><p className="playlist-kicker">Video preview</p><h2 id="playlistPreviewTitle">Monitor video</h2></div><button id="playlistPreviewClose" className="playlist-preview-close" type="button" aria-label="Close video preview">×</button></div>
   <div className="playlist-preview-body"><video id="playlistPreviewVideo" controls preload="metadata" playsInline/><p id="playlistPreviewError" className="playlist-feedback" role="status" hidden>This video could not be played. Try an MP4 version of the file.</p></div>
  </dialog>
 </>
}
