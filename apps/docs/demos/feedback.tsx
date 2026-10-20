/** @jsxRuntime automatic */
/** @jsxImportSource pipis */

import './styles.css';
import {
  reactive,
  select,
  Dynamic,
  ErrorBoundary,
  If,
  Portal,
  PortalTarget,
  defineContext,
  type PortalTargetValue,
  type ReactiveState,
  type JSXElement,
  Effect,
  Helmet,
} from 'pipis';

const [withAccent, getAccent] = defineContext('text-green-400');

function starRating(rating: ReactiveState<number>) {
  const accent = getAccent();
  const star = (index: number) => {
    const filled = select(rating, (value) => index < value);
    const starClass = select(filled, (isFilled) => `text-2xl leading-none transition ${isFilled ? accent : 'text-slate-600'}`);
    return (
      <button type="button" onclick={() => (rating.value = index + 1)} className={starClass}>
        ★
      </button>
    );
  };
  // You could also use <Repeat> here, however since we're only rendering a fixed number of stars,
  // using a plain array is simpler and more efficient.
  return <div className="flex gap-1">{...Array.from({ length: 5 }, (_, i) => star(i))}</div>;
}

// A hand-written JSXElement: throws as soon as it's actually mounted (not merely constructed).
const crashyElement: JSXElement = (parent) => {
  if (parent) {
    throw new Error('Simulated render crash');
  }
  return null;
};

// ErrorBoundary only catches errors thrown while mounting its *direct* children, not children
// mediated by a reactive value further down the tree. Dynamic here turns the "should crash"
// reactive into a plain boolean, so the crashy component's presence is decided once, at the point
// ErrorBoundary itself mounts - not through a reactive update it can't see past.
function crashTestPanel(crash: boolean) {
  return (
    <ErrorBoundary fallback={(error) => <p className="text-sm text-rose-400">Caught a crash: {select(error, String)}</p>}>
      <p className="text-sm text-slate-400">This panel is healthy.</p>
      {crash && crashyElement}
    </ErrorBoundary>
  );
}

export function FeedbackApp() {
  const portalTarget = reactive<PortalTargetValue>();
  const rating = reactive(0);
  const comment = reactive('');
  const modalOpen = reactive(false);
  const crashTest = reactive(false);
  const commentBox = reactive<HTMLTextAreaElement>();

  function submitFeedback() {
    modalOpen.value = false;
    rating.value = 0;
    comment.value = '';
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100">
      <Helmet>
        <title>Feedback app</title>
      </Helmet>
      {/* Rendered wherever it sits in the tree; the modal below portals into it regardless. */}
      <PortalTarget ref={portalTarget} />

      <div className="mx-auto flex max-w-md flex-col gap-6">
        <div className="rounded-2xl bg-slate-900/70 p-6 ring-1 ring-white/10">
          <h1 className="text-lg font-semibold">How was your experience?</h1>
          <div className="mt-3">{withAccent('text-amber-400', () => starRating(rating))}</div>
          <button
            onclick={() => (modalOpen.value = true)}
            className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            Leave feedback
          </button>
        </div>

        <div className="rounded-2xl bg-slate-900/70 p-6 ring-1 ring-white/10">
          <p className="text-sm text-slate-400">Debug: this panel can crash on demand.</p>
          <button
            onclick={() => (crashTest.value = !crashTest.value)}
            className="mt-3 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-700"
          >
            {select(crashTest, (c) => (c ? 'Reset panel' : 'Trigger crash'))}
          </button>
          <div className="mt-3">
            <Dynamic value={crashTest}>{crashTestPanel}</Dynamic>
          </div>
        </div>
      </div>

      <Portal target={portalTarget}>
        <If condition={modalOpen}>
          <Effect>
            {() => {
              commentBox.value?.focus();
            }}
          </Effect>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 ring-1 ring-white/10">
              <h2 className="text-lg font-semibold text-white">Tell us more</h2>
              <p className="mt-1 text-sm text-slate-400">You rated us {rating}/5.</p>
              <textarea
                ref={commentBox}
                value={comment}
                oninput={(e) => (comment.value = e.target.value)}
                rows={3}
                placeholder="What could we improve?"
                className="mt-3 w-full rounded-lg bg-white/5 p-3 text-sm text-white ring-1 ring-white/10 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onclick={() => (modalOpen.value = false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onclick={submitFeedback}
                  className="rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-400"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </If>
      </Portal>
    </div>
  );
}
