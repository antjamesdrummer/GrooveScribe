import { describe, it, expect, vi } from 'vitest';
import {
  EMBED_MESSAGE_SOURCE,
  HOST_MESSAGE_SOURCE,
  HOST_PROTOCOL_VERSION,
  attachHostPlayhead,
  handleHostPlayheadMessage,
  isHostPlayheadMessage,
} from '../../js/hostPlayhead.js';

// The embed is on a different origin from whatever page frames it, so this
// message shape is the entire contract between the two. Both sides are
// deployed separately: a change here that is not also a version bump silently
// breaks whichever one is older.

function makeGu() {
  return {
    highlightNoteInABCSVGFromPercentComplete: vi.fn(),
    clearHighlightNoteInABCSVG: vi.fn(),
  };
}

function hostMessage(fields) {
  return { source: HOST_MESSAGE_SOURCE, v: HOST_PROTOCOL_VERSION, ...fields };
}

describe('isHostPlayheadMessage', () => {
  it('accepts a well-formed host message', () => {
    expect(isHostPlayheadMessage(hostMessage({ type: 'playhead', percent: 0.5 }))).toBe(true);
  });

  it('rejects anything not addressed to us', () => {
    expect(isHostPlayheadMessage(null)).toBe(false);
    expect(isHostPlayheadMessage('playhead')).toBe(false);
    expect(isHostPlayheadMessage({ type: 'playhead', percent: 0.5 })).toBe(false);
    expect(isHostPlayheadMessage({ source: 'someone-else', v: 1, type: 'playhead' })).toBe(false);
  });

  it('rejects a version it does not know', () => {
    expect(
      isHostPlayheadMessage({
        source: HOST_MESSAGE_SOURCE,
        v: HOST_PROTOCOL_VERSION + 1,
        type: 'playhead',
      })
    ).toBe(false);
  });
});

describe('handleHostPlayheadMessage', () => {
  it('moves the highlight to the requested position', () => {
    const gu = makeGu();
    expect(handleHostPlayheadMessage(gu, hostMessage({ type: 'playhead', percent: 0.25 }))).toBe(
      true
    );
    expect(gu.highlightNoteInABCSVGFromPercentComplete).toHaveBeenCalledWith(0.25);
  });

  it('clears the highlight when there is no position', () => {
    const gu = makeGu();
    handleHostPlayheadMessage(gu, hostMessage({ type: 'playhead', percent: null }));
    expect(gu.clearHighlightNoteInABCSVG).toHaveBeenCalled();
    expect(gu.highlightNoteInABCSVGFromPercentComplete).not.toHaveBeenCalled();
  });

  // A host deriving the fraction from an audio clock lands a hair past the end
  // of the last step; rejecting that would drop the final note of every repeat.
  it('clamps rather than dropping a position at or past the end', () => {
    const gu = makeGu();
    handleHostPlayheadMessage(gu, hostMessage({ type: 'playhead', percent: 1 }));
    handleHostPlayheadMessage(gu, hostMessage({ type: 'playhead', percent: -0.2 }));
    const calls = gu.highlightNoteInABCSVGFromPercentComplete.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBeLessThan(1);
    expect(calls[0]).toBeGreaterThan(0.99);
    expect(calls[1]).toBe(0);
  });

  it('answers a ping so a host that mounted late can discover us', () => {
    const gu = makeGu();
    const reply = vi.fn();
    expect(handleHostPlayheadMessage(gu, hostMessage({ type: 'ping' }), reply)).toBe(true);
    expect(reply).toHaveBeenCalledWith({
      source: EMBED_MESSAGE_SOURCE,
      v: HOST_PROTOCOL_VERSION,
      type: 'ready',
    });
  });

  it('ignores traffic that is not ours', () => {
    const gu = makeGu();
    expect(handleHostPlayheadMessage(gu, { type: 'playhead', percent: 0.5 })).toBe(false);
    expect(gu.highlightNoteInABCSVGFromPercentComplete).not.toHaveBeenCalled();
    expect(gu.clearHighlightNoteInABCSVG).not.toHaveBeenCalled();
  });
});

describe('attachHostPlayhead', () => {
  function makeWindow({ framed }) {
    const listeners = [];
    const parent = { postMessage: vi.fn() };
    const view = {
      addEventListener: (_type, fn) => listeners.push(fn),
      removeEventListener: (_type, fn) => {
        const at = listeners.indexOf(fn);
        if (at > -1) listeners.splice(at, 1);
      },
      postMessage: vi.fn(),
      listeners,
    };
    view.parent = framed ? parent : view;
    return view;
  }

  it('does nothing at the top level, where there is no host', () => {
    const gu = makeGu();
    const view = makeWindow({ framed: false });
    attachHostPlayhead(gu, view);
    expect(view.listeners).toHaveLength(0);
  });

  it('announces itself and then follows the host', () => {
    const gu = makeGu();
    const view = makeWindow({ framed: true });
    const detach = attachHostPlayhead(gu, view);

    expect(view.parent.postMessage).toHaveBeenCalledWith(
      { source: EMBED_MESSAGE_SOURCE, v: HOST_PROTOCOL_VERSION, type: 'ready' },
      '*'
    );

    view.listeners[0]({ data: hostMessage({ type: 'playhead', percent: 0.75 }) });
    expect(gu.highlightNoteInABCSVGFromPercentComplete).toHaveBeenCalledWith(0.75);

    detach();
    expect(view.listeners).toHaveLength(0);
  });
});
