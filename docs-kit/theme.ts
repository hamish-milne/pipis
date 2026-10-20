// The script that sets the page's theme before it is painted: the stored choice, or else the system's. It is in the head of every page and of
// the frame of an example, so that neither flashes the wrong theme. Plain text, because it runs before anything else does.
export const THEME_SCRIPT =
  "(function(){var t;try{t=localStorage.getItem('docs-theme')}catch(e){}" +
  "if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';" +
  'document.documentElement.dataset.theme=t})()';
