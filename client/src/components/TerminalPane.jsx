import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

function wsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

/**
 * Owns one xterm.js instance and one WebSocket connection for the lifetime
 * of an SSH session. Mounted once when a session tab moves from the
 * connection form into the terminal phase, and stays mounted (just hidden
 * via CSS) while the user switches to other tabs, so scrollback and the
 * live connection both survive tab switches.
 */
const TerminalPane = forwardRef(function TerminalPane({ sessionId, config, active, onStatus }, ref) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const disposedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    disconnect() {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'disconnect' }));
      }
      ws?.close();
    },
    // Used by "Paste to Terminal" (Command Dictionary): sends raw text into
    // this session's shell exactly like typed/pasted keystrokes would —
    // same 'data' message type as term.onData below, no trailing newline
    // added, so nothing is executed automatically. Only ever called for
    // the currently active tab (see Workspace), and a no-op if this
    // session isn't actually connected.
    sendData(text) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data: text }));
      }
      termRef.current?.focus();
    },
  }));

  // Set up the terminal + websocket exactly once per session id.
  useEffect(() => {
    disposedRef.current = false;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"Cascadia Code", "Fira Code", Menlo, Consolas, monospace',
      fontSize: 14,
      scrollback: 5000,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'connect', payload: { ...config, cols, rows } }));
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'data') {
        term.write(msg.data);
      } else if (msg.type === 'status') {
        onStatus(msg.status, msg.message);
      }
    });

    ws.addEventListener('close', () => {
      if (!disposedRef.current) onStatus('disconnected', 'Connection closed.');
    });

    ws.addEventListener('error', () => {
      if (!disposedRef.current) onStatus('error', 'WebSocket connection error.');
    });

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const handleWindowResize = () => {
      // Only fit while visible: a hidden (display:none) pane reports zero size.
      if (containerRef.current && containerRef.current.offsetParent !== null) {
        fitAddon.fit();
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      disposedRef.current = true;
      window.removeEventListener('resize', handleWindowResize);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'disconnect' }));
        }
      } catch {
        // ignore
      }
      ws.close();
      term.dispose();
    };
    // Intentionally only re-run if the session identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Re-fit + refocus whenever this pane becomes the active tab, since a
  // hidden pane can't measure its size while display:none.
  useEffect(() => {
    if (active && fitAddonRef.current) {
      const t = setTimeout(() => {
        fitAddonRef.current.fit();
        termRef.current?.focus();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [active]);

  return <div ref={containerRef} className="xterm-container" />;
});

export default TerminalPane;
