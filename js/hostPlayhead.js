/**
 * Lets the page that embeds this viewer drive the note highlight.
 *
 * An embed is an iframe on another origin, so a host page can neither see the
 * MIDI player's play button being pressed nor reach in to move the highlight.
 * That leaves a host with its own audio — a metronome, a backing groove — no
 * way to show where in the bar it has got to, other than reimplementing the
 * note geometry by guessing at pixel positions of somebody else's SVG.
 *
 * There is no need for any of that. GrooveUtils already knows which SVG note
 * belongs to which point in the groove; that is what
 * highlightNoteInABCSVGFromPercentComplete does for its own playback. This
 * exposes the same call over postMessage, so the host keeps the clock and this
 * keeps the drawing. Nothing about local playback changes.
 *
 * The host stays in charge deliberately. The alternative — this playing and
 * telling the host where it is — would put the host's audio on one clock and
 * ours on another, and a few milliseconds of disagreement between two drum
 * sounds is heard as a flam. A highlight arriving a frame late is not heard at
 * all.
 */

/** Messages we accept must carry this, so we ignore other traffic on the page. */
export const HOST_MESSAGE_SOURCE = 'fluentdrummer';

/** Messages we send carry this, so a host can tell our reply from an echo. */
export const EMBED_MESSAGE_SOURCE = 'fluentdrummer-scribe';

/**
 * Bumped only for a breaking change to the message shape.
 *
 * A host and an embed are deployed separately and will often be different
 * ages, so both sides ignore a version they do not know rather than guessing.
 */
export const HOST_PROTOCOL_VERSION = 1;

/**
 * @typedef {object} HostPlayheadMessage
 * @property {string} source
 * @property {number} v
 * @property {string} type
 * @property {number|null} [percent]
 */

/**
 * True when `data` is a message from a host meant for us.
 *
 * @param {unknown} data
 * @returns {data is HostPlayheadMessage}
 */
export function isHostPlayheadMessage(data) {
  if (!data || typeof data !== 'object') return false;
  var message = /** @type {HostPlayheadMessage} */ (data);
  return (
    message.source === HOST_MESSAGE_SOURCE &&
    message.v === HOST_PROTOCOL_VERSION &&
    typeof message.type === 'string'
  );
}

/**
 * Handles one message. Exported separately so it can be tested without a DOM.
 *
 * @param {object} gu a GrooveUtils instance
 * @param {unknown} data the message payload
 * @param {(_reply: object) => void} [reply] called to answer the sender
 * @returns {boolean} whether the message was ours
 */
export function handleHostPlayheadMessage(gu, data, reply) {
  if (!isHostPlayheadMessage(data)) return false;

  if (data.type === 'ping') {
    // A host that mounts after we have loaded would otherwise never hear the
    // ready we sent on startup, and would sit there assuming a viewer too old
    // to answer.
    if (reply) reply({ source: EMBED_MESSAGE_SOURCE, v: HOST_PROTOCOL_VERSION, type: 'ready' });
    return true;
  }

  if (data.type !== 'playhead') return false;

  var percent = data.percent;
  if (typeof percent !== 'number' || !isFinite(percent)) {
    gu.clearHighlightNoteInABCSVG();
    return true;
  }

  // Clamped rather than rejected: a host computing a fraction from an audio
  // clock can land a hair past 1 at the end of a bar, and dropping the last
  // note of every repeat would look like a bug in the notation.
  var clamped = Math.min(Math.max(percent, 0), 0.999999);
  gu.highlightNoteInABCSVGFromPercentComplete(clamped);
  return true;
}

/**
 * Starts listening, and announces that this viewer understands the protocol.
 *
 * Only ever attached when framed. In a top-level page there is no host, and
 * the editor should not have its highlight moved by anything on the page; in a
 * page holding several embeds each iframe is its own window, so a message
 * reaches exactly the one it was posted to.
 *
 * `targetOrigin` is '*' on purpose. An embed cannot know which origin framed
 * it, and the payload is a position in a groove that is already in the URL —
 * there is nothing here worth keeping from another listener.
 *
 * @param {object} gu a GrooveUtils instance
 * @param {Window} [win]
 * @returns {() => void} detach
 */
export function attachHostPlayhead(gu, win) {
  var view = win || (typeof window !== 'undefined' ? window : null);
  if (!view || view.parent === view) return function () {};

  var listener = function (/** @type {MessageEvent} */ event) {
    handleHostPlayheadMessage(gu, event.data, function (message) {
      var target = /** @type {Window|null} */ (event.source) || view.parent;
      if (target && target.postMessage) target.postMessage(message, '*');
    });
  };

  view.addEventListener('message', listener, false);
  view.parent.postMessage(
    { source: EMBED_MESSAGE_SOURCE, v: HOST_PROTOCOL_VERSION, type: 'ready' },
    '*'
  );

  return function () {
    view.removeEventListener('message', listener, false);
  };
}
